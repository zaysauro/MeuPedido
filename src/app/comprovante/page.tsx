'use client';
import {useEffect,useState} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};
type Detail={order:{order_number:number;channel:string;total_cents:number;paid_cents:number;created_at:string;status:string};items:{id:string;name_snapshot:string;quantity:number;unit_price_cents:number;addons_cents:number;notes:string|null}[]};
const money=(v:number)=>((Number(v)||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function Comprovante(){
 const {data:session,isPending}=authClient.useSession();
 const [orgs,setOrgs]=useState<Org[]>([]),[org,setOrg]=useState(''),[order,setOrder]=useState(''),[detail,setDetail]=useState<Detail|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{const q=new URLSearchParams(window.location.search);setOrder(q.get('orderId')||'');if(session)fetch('/api/organizations').then(r=>r.json()).then(d=>{setOrgs(d.organizations||[]);setOrg(d.organizations?.[0]?.id||'')}).catch(()=>setMessage('Erro ao carregar estabelecimento'))},[session]);
 useEffect(()=>{if(!org||!order)return;fetch('/api/restaurant/order-detail?organizationId='+encodeURIComponent(org)+'&orderId='+encodeURIComponent(order),{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(setDetail).catch(()=>setMessage('Nao foi possivel carregar o pedido'))},[org,order]);
 if(isPending)return <main>Carregando...</main>;
 if(!session)return <main><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:420,margin:'auto',padding:20,color:'#111',fontFamily:'monospace'}}>
 <div className="no-print"><a href="/comandas">Voltar</a><label> Estabelecimento <select value={org} onChange={e=>setOrg(e.target.value)}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><button onClick={()=>window.print()} disabled={!detail}>Imprimir</button></div>
 {detail&&<article><h1 style={{textAlign:'center'}}>{orgs.find(o=>o.id===org)?.name||'MeuPedido'}</h1><p style={{textAlign:'center'}}>Comprovante de pedido — nao fiscal</p><hr/><p>Pedido #{detail.order.order_number}</p><p>{new Date(detail.order.created_at).toLocaleString('pt-BR')}</p><p>Tipo: {detail.order.channel}</p><hr/>
 {detail.items.map(i=><div key={i.id}><p>{i.quantity} x {i.name_snapshot} — {money((i.unit_price_cents+i.addons_cents)*i.quantity)}</p>{i.notes&&<small>{i.notes}</small>}</div>)}
 <hr/><h2>Total: {money(detail.order.total_cents)}</h2><p>Pago: {money(detail.order.paid_cents)}</p><p>Saldo: {money(Math.max(0,detail.order.total_cents-Number(detail.order.paid_cents)))}</p><p style={{textAlign:'center'}}>Obrigado pela preferencia!</p></article>}
 {message&&<p role="alert">{message}</p>}
 <style jsx global>{`@media print{.no-print{display:none!important}body{margin:0;background:#fff}@page{size:80mm auto;margin:3mm}}`}</style>
 </main>;
}
