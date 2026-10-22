'use client';
/** Successful mutations invalidate visible modules, including other open tabs. */
export async function apiFetch(input:RequestInfo|URL,init?:RequestInit){
 if(typeof navigator!=='undefined'&&!navigator.onLine&&init?.method&&init.method.toUpperCase()!=='GET')throw Error('Sem conexão. Reconecte antes de confirmar a operação.');
 const response=await fetch(input,{cache:'no-store',...init});
 if(response.status===401){window.dispatchEvent(new Event('meupedido:session-expired'));}
 if(response.ok&&init?.method&&!['GET','HEAD'].includes(init.method.toUpperCase())){
  window.dispatchEvent(new Event('meupedido:changed'));
  if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('meupedido-data');channel.postMessage('changed');channel.close();}
 }
 return response;
}
