'use client';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
type Org = { id: string; name: string };
type Ingredient = { id: string; name: string; unit: string; quantity: string; minimum_quantity: string; cost_per_unit_cents:string;low_stock: boolean };
export default function Estoque() {
  const [movements,setMovements]=useState<{id:string;name:string;movement_type:string;quantity:string;created_at:string}[]>([]);
  const { data: session, isPending } = authClient.useSession();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [org, setOrg] = useState('');
  const [items, setItems] = useState<Ingredient[]>([]);
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState('entrada');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!session) return;
    fetch('/api/organizations').then(r => r.json()).then(d => {
      setOrgs(d.organizations || []);
      setOrg(d.organizations?.[0]?.id || '');
    }).catch(() => setMessage('Não foi possível carregar os estabelecimentos.'));
  }, [session]);
  async function refresh() {
    if (!org) return;
    try {
      const r = await fetch('/api/restaurant/inventory?organizationId=' + encodeURIComponent(org), { cache: 'no-store' });
      if (!r.ok) throw Error();
      const data=await r.json();setItems(data.items||[]);setMovements(data.movements||[]);
    } catch { setMessage('Falha ao carregar estoque. Tente atualizar a página ou fale com o suporte.'); }
  }
  useEffect(() => { setSelected(''); void refresh(); }, [org]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(quantity.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) { setMessage('Quantidade inválida.'); return; }
    setBusy(true); setMessage('');
    try {
      const r = await fetch('/api/restaurant/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: org, ingredientId: selected, kind, quantity: n, notes })
      });
      if (!r.ok) throw Error();
      setQuantity(''); setNotes(''); setMessage('Movimentação registrada.');
      await refresh();
    } catch { setMessage('Movimentação não permitida. Verifique o saldo e suas permissões.'); }
    finally { setBusy(false); }
  }
  if (isPending) return <main style={{ padding: 24 }}>Carregando...</main>;
  if (!session) return <main style={{ padding: 24 }}><a href="/login">Entrar</a></main>;
  return <main style={{ maxWidth: 1000, margin: '30px auto', padding: 24, color: '#173d2d' }}>
    <a href="/painel">← Painel</a><h1>Estoque de ingredientes</h1>
    <label>Estabelecimento <select value={org} onChange={e => setOrg(e.target.value)}>
      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select></label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 24, marginTop: 24 }}>
      <section><h2>Saldos atuais</h2><a href="/operacao">Cadastrar ingrediente →</a>
        {items.map(i => <article key={i.id} style={{ borderBottom: '1px solid #ddd', padding: 12, background: i.low_stock ? '#fff2ef' : 'transparent' }}>
          <strong>{i.name}</strong><button onClick={async()=>{const value=prompt('Custo por '+i.unit+' em reais (até 4 casas decimais):',String(Number(i.cost_per_unit_cents)/100));if(value===null)return;const n=Number(value.replace(',','.'));if(!Number.isFinite(n)||n<0)return;const r=await fetch('/api/restaurant/inventory',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:org,ingredientId:i.id,costPerUnitCents:Math.round(n*1000000)/10000})});if(r.ok)void refresh();else setMessage('Não foi possível salvar o custo.');}}>Custo: {(Number(i.cost_per_unit_cents)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:4})}</button><br />{Number(i.quantity).toLocaleString('pt-BR')} {i.unit}
          {i.low_stock && <span style={{ color: '#b32828' }}> · Estoque baixo</span>}
          <small style={{ display: 'block' }}>Mínimo: {Number(i.minimum_quantity).toLocaleString('pt-BR')} {i.unit}</small>
        </article>)}
        {!items.length && <p>Nenhum ingrediente cadastrado. Cadastre em Operação.</p>}
      </section>
      <section><h2>Movimentar ingrediente</h2>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <label>Ingrediente<select required value={selected} onChange={e => setSelected(e.target.value)} style={{ display: 'block', padding: 10, width: '100%' }}>
            <option value="">Selecione</option>{items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
          </select></label>
          <label>Movimento<select value={kind} onChange={e => setKind(e.target.value)} style={{ display: 'block', padding: 10, width: '100%' }}>
            <option value="entrada">Entrada</option><option value="ajuste_positivo">Ajuste positivo</option><option value="ajuste_negativo">Ajuste negativo</option>
          </select></label>
          <label>Quantidade<input required inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} style={{ display: 'block', padding: 10, width: '100%' }} /></label>
          <label>Motivo / observação<textarea maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} style={{ display: 'block', padding: 10, width: '100%' }} /></label>
          <button disabled={busy || !selected} style={{ background: '#17663c', color: 'white', border: 0, borderRadius: 8, padding: 14 }}>{busy ? 'Salvando...' : 'Registrar movimentação'}</button>
        </form>
      </section>
    </div><section className="panel" style={{marginTop:24}}><h2>Histórico de movimentações</h2>{movements.map(m=><p key={m.id}>{new Date(m.created_at).toLocaleString('pt-BR')} · {m.name} · {m.movement_type} · {Number(m.quantity).toLocaleString('pt-BR')}</p>)}{!movements.length&&<p>Nenhuma movimentação registrada.</p>}</section>{message && <p role="status">{message}</p>}
  </main>;
}
