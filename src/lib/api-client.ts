'use client';
/** Successful mutations invalidate visible modules, including other open tabs. */
export async function apiFetch(input:RequestInfo|URL,init?:RequestInit){
 const response=await fetch(input,{cache:'no-store',...init});
 if(response.ok&&init?.method&&!['GET','HEAD'].includes(init.method.toUpperCase())){
  window.dispatchEvent(new Event('meupedido:changed'));
  if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('meupedido-data');channel.postMessage('changed');channel.close();}
 }
 return response;
}
