const keyPattern = /^[A-Za-z0-9_-]+={0,2}$/;
const exactPushHosts = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);

/** Only browser push services are allowed. Arbitrary URLs must never be fetched. */
export function validPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      !url.hash && url.pathname.length > 1 && (
        exactPushHosts.has(url.hostname) ||
        /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname) ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
      );
  } catch { return false; }
}

export function validPushSubscription(value) {
  if (!value || typeof value !== 'object' || !validPushEndpoint(value.endpoint)) return false;
  if (!value.keys || typeof value.keys !== 'object') return false;
  const {p256dh, auth} = value.keys;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' ||
      !keyPattern.test(p256dh) || !keyPattern.test(auth) ||
      p256dh.length > 90 || auth.length > 24) return false;
  const publicKey = Buffer.from(p256dh, 'base64url');
  return publicKey.length === 65 && publicKey[0] === 4 && Buffer.from(auth, 'base64url').length === 16;
}

export function pushCopy(eventType) {
  if (['order.created','order.items_added','kitchen.order_received'].includes(eventType))
    return {title:'Novo pedido · MeuPedido', body:'Há novos itens para acompanhar na operação.'};
  if (eventType === 'kitchen.order_ready')
    return {title:'Pedido pronto · MeuPedido', body:'Um pedido está pronto. Abra o MeuPedido para conferir.'};
  if (eventType === 'kitchen.preparation_started')
    return {title:'Preparo iniciado · MeuPedido', body:'A cozinha iniciou um preparo.'};
  return {title:'Atualização · MeuPedido', body:'Há uma atualização na operação. Abra o MeuPedido para conferir.'};
}
