'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createRealtimeClient, type RealtimeClient, type SealedLiveQuery, type LiveQueryState, type MaterializedLiveQuerySubscription } from '@neon/realtime/client';
import { notificationLabel, notificationTone, unseenNotifications, type NotificationPreferences, type OperationalNotification, type OperationalVersion } from '@/lib/realtime-events';

type Capabilities = {
  url: string;
  versionQuery: SealedLiveQuery<OperationalVersion>;
  notificationQuery: SealedLiveQuery<OperationalNotification>;
  preferences: NotificationPreferences;
};
type ConnectionStatus = 'connecting' | 'live' | 'offline' | 'stale' | 'error' | 'expired' | 'unconfigured';

class CapabilityError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function fetchCapabilities(signal: AbortSignal): Promise<Capabilities> {
  const response = await fetch('/api/realtime', { cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new CapabilityError(response.status, data.code || '', data.error || 'Conexão indisponível.');
  return data;
}

export function OperationalLive({ organizationId, userId }: { organizationId: string; userId: string }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [message, setMessage] = useState('');
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>({ sound_enabled: false, push_enabled: false });
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const latestVersion = useRef<string | null>(null);
  const lastTone = useRef(0);
  useEffect(() => { if (pathname === '/notificacoes') setExpanded(true); }, [pathname]);

  useEffect(() => { soundEnabled.current = preferences.sound_enabled; }, [preferences.sound_enabled]);
  useEffect(() => {
    seen.current.clear();
    initialized.current = false;
    latestVersion.current = null;
    setNotifications([]);
  }, [organizationId, userId]);
  useEffect(() => () => { void audio.current?.close(); }, []);

  useEffect(() => {
    if (!organizationId) return;
    let disposed = false;
    let client: RealtimeClient | null = null;
    let versionSubscription: MaterializedLiveQuerySubscription<OperationalVersion> | null = null;
    let notificationSubscription: MaterializedLiveQuerySubscription<OperationalNotification> | null = null;
    let renewTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retries = 0;
    let renewing = false;
    let fatal = false;
    let initialResult = true;
    let lastConnectionStatus = '';
    let connectionGeneration = 0;
    const abort = new AbortController();

    const closeConnection = () => {
      clearTimeout(renewTimer);
      versionSubscription?.unsubscribe();
      notificationSubscription?.unsubscribe();
      versionSubscription = null;
      notificationSubscription = null;
      client?.close();
      client = null;
    };
    const invalidate = () => window.dispatchEvent(new Event('meupedido:changed'));
    const scheduleRetry = () => {
      if (disposed || fatal || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, Math.min(30_000, 1000 * 2 ** Math.min(retries++, 5)));
    };
    const failure = (error: unknown) => {
      if (disposed || abort.signal.aborted) return;
      if (error instanceof CapabilityError && [401, 403].includes(error.status)) {
        fatal = true;
        closeConnection();
        setNotifications([]);
        setStatus(error.status === 401 ? 'expired' : 'error');
        setMessage(error.message);
        window.dispatchEvent(new Event('meupedido:session-expired'));
      } else if (error instanceof CapabilityError && error.code === 'realtime_unconfigured') {
        fatal = true;
        closeConnection();
        setStatus('unconfigured');
        setMessage(error.message);
      } else {
        setStatus(navigator.onLine ? 'error' : 'offline');
        setMessage('A sincronização foi interrompida. Reconectando…');
        scheduleRetry();
      }
    };
    const scheduleRenewal = (capabilities: Capabilities) => {
      clearTimeout(renewTimer);
      const expiresAt = Math.min(capabilities.versionQuery.expiresAt, capabilities.notificationQuery.expiresAt);
      renewTimer = setTimeout(() => void renew(), Math.max(1000, expiresAt - Date.now() - 10_000));
    };
    const renew = async () => {
      if (disposed || renewing || fatal) return;
      renewing = true;
      const generation = connectionGeneration;
      try {
        const capabilities = await fetchCapabilities(abort.signal);
        if (disposed || fatal || generation !== connectionGeneration) return;
        await Promise.all([
          versionSubscription?.renew(capabilities.versionQuery),
          notificationSubscription?.renew(capabilities.notificationQuery),
        ]);
        setPreferences(capabilities.preferences);
        scheduleRenewal(capabilities);
      } catch (error) { if (generation === connectionGeneration) failure(error); }
      finally { renewing = false; }
    };
    const connectionState = (state: LiveQueryState) => {
      if (disposed || state.status === 'closed') return;
      if (state.status === 'error') {
        // A terminal SDK error requires a new client; transport reconnects otherwise belong to the SDK.
        failure(new Error('realtime_subscription_failed'));
        return;
      }
      if (state.status === 'live') {
        if (lastConnectionStatus !== 'live') invalidate(); // Recover all persisted state after reconnect.
        retries = 0;
        setMessage('');
      }
      lastConnectionStatus = state.status;
      setStatus(navigator.onLine ? state.status : 'offline');
    };
    const playTone = (kind: 'new' | 'ready') => {
      const context = audio.current;
      if (!soundEnabled.current || !context || context.state !== 'running' || Date.now() - lastTone.current < 2000) return;
      lastTone.current = Date.now();
      const frequencies = kind === 'ready' ? [660, 880] : [440, 550];
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.18;
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.17);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    };
    const connect = async () => {
      if (disposed || fatal) return;
      if (!navigator.onLine) { setStatus('offline'); return; }
      const generation = ++connectionGeneration;
      closeConnection();
      setStatus('connecting');
      try {
        const capabilities = await fetchCapabilities(abort.signal);
        if (disposed || fatal || generation !== connectionGeneration) return;
        setPreferences(capabilities.preferences);
        client = createRealtimeClient({ url: capabilities.url, logLevel: 'silent' });
        versionSubscription = client.subscribe(capabilities.versionQuery);
        notificationSubscription = client.subscribe(capabilities.notificationQuery);
        versionSubscription.onStateChange(connectionState);
        notificationSubscription.onStateChange(state => {
          if (state.status === 'error') failure(new Error('notification_subscription_failed'));
        });
        versionSubscription.onChange(snapshot => {
          if (disposed || snapshot.status !== 'live' || !snapshot.data) return;
          const version = snapshot.data[0]?.version;
          if (version === undefined) {
            // Membership or the session was revoked: discard sensitive state immediately.
            fatal = true;
            setNotifications([]);
            setStatus('expired');
            setMessage('Seu acesso mudou. Entre novamente.');
            closeConnection();
            window.dispatchEvent(new Event('meupedido:session-expired'));
            return;
          }
          if (initialResult || latestVersion.current !== String(version)) {
            initialResult = false;
            latestVersion.current = String(version);
            invalidate();
          }
        });
        notificationSubscription.onChange(snapshot => {
          if (disposed || snapshot.status !== 'live' || !snapshot.data) return;
          const rows = snapshot.data;
          const fresh = unseenNotifications(rows, seen.current);
          setNotifications([...rows]);
          if (initialized.current) {
            const recent = fresh.find(row => !row.read_at && Date.now() - new Date(row.created_at).getTime() < 300_000);
            if (recent) {
              setNotice(notificationLabel(recent));
              const tone = notificationTone(recent.event_type);
              if (tone) playTone(tone);
            }
          }
          initialized.current = true;
        });
        scheduleRenewal(capabilities);
      } catch (error) { if (generation === connectionGeneration) failure(error); }
    };
    const online = () => { if (!fatal) { clearTimeout(retryTimer); retryTimer = undefined; void connect(); } };
    const offline = () => setStatus('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    void connect();
    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(retryTimer);
      closeConnection();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [organizationId, userId, attempt]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const updateNotifications = async (body: { soundEnabled?: boolean; eventIds?: string[] }) => {
    setSaving(true);
    try {
      const response = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw Error();
      if (body.soundEnabled !== undefined) setPreferences(current => ({ ...current, sound_enabled: body.soundEnabled! }));
      if (body.eventIds) setNotifications(current => current.map(row => body.eventIds!.includes(row.id) ? { ...row, read_at: new Date() } : row));
      setMessage('');
    } catch { setMessage('Não foi possível salvar sua preferência. Tente novamente.'); }
    finally { setSaving(false); }
  };
  const enableSound = async () => {
    try {
      if (!audio.current) audio.current = new AudioContext();
      await audio.current.resume();
      setAudioUnlocked(audio.current.state === 'running');
      await updateNotifications({ soundEnabled: true });
    } catch { setMessage('Este navegador não liberou o áudio. Os avisos visuais continuam disponíveis.'); }
  };
  const unread = notifications.filter(row => !row.read_at);
  const statusLabels: Record<ConnectionStatus, string> = {
    live: 'Dispositivos sincronizados',
    connecting: 'Conectando dispositivos…',
    offline: 'Sem conexão — operações indisponíveis',
    stale: 'Reconectando — informações podem estar desatualizadas',
    error: 'Sincronização interrompida',
    expired: 'Sessão encerrada',
    unconfigured: 'Sincronização ainda não configurada',
  };

  if (!organizationId) return null;
  return <section aria-label="Sincronização e notificações" className="operational-live" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'relative' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span role="status" style={{ fontSize: 13 }}>{status === 'live' ? '● ' : '○ '}{statusLabels[status]}</span>
      <button type="button" aria-expanded={expanded} aria-controls="operational-notifications" onClick={() => setExpanded(value => !value)}>
        Avisos{unread.length ? ` (${unread.length})` : ''}
      </button>
      {status === 'expired' ? <a href="/login">Entrar novamente</a> : ['error', 'unconfigured'].includes(status) ? <button type="button" onClick={() => setAttempt(value => value + 1)}>Reconectar</button> : null}
    </div>
    {notice && <div role="status" style={{ paddingTop: 8 }}><strong>{notice}</strong></div>}
    {message && <p role="alert" style={{ margin: '8px 0 0', fontSize: 13 }}>{message}</p>}
    {expanded && <div id="operational-notifications" style={{ paddingTop: 16, maxHeight: 420, overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" disabled={saving} onClick={() => preferences.sound_enabled && audioUnlocked ? void updateNotifications({ soundEnabled: false }) : void enableSound()}>
          {preferences.sound_enabled && audioUnlocked ? 'Silenciar sons' : 'Ativar sons neste dispositivo'}
        </button>
        <button type="button" disabled={saving || !unread.length} onClick={() => void updateNotifications({ eventIds: unread.map(row => row.id) })}>Marcar avisos recentes como lidos</button>
      </div>
      <p style={{ fontSize: 12 }}>Últimos 100 avisos. Sons exigem ativação neste navegador.</p>
      {notifications.length ? <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {notifications.map(row => <li key={row.id} style={{ borderTop: '1px solid var(--border)', padding: '12px 0', opacity: row.read_at ? 0.7 : 1 }}>
          <strong>{!row.read_at ? '● ' : ''}{notificationLabel(row)}</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
            <time dateTime={new Date(row.created_at).toISOString()} style={{ fontSize: 12 }}>{new Date(row.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>
            {!row.read_at && <button type="button" disabled={saving} onClick={() => void updateNotifications({ eventIds: [row.id] })}>Marcar como lido</button>}
          </div>
        </li>)}
      </ul> : <p>Nenhum aviso recente.</p>}
    </div>}
  </section>;
}
