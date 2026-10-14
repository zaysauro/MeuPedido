'use client';
import {useOrganization} from '@/components/organization-provider';
import {apiFetch} from '@/lib/api-client';
import {useEffect,useState} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};
type Detail={establishment?:{phone:string;address:string;receipt_footer:string};payments:{id:string;method:string;amount_cents:number}[];order:{order_number:number;channel:string;discount_cents:number;total_cents:number;paid_cents:number;created_at:string;status:string;delivery_fee_cents:number;delivery_street:string|null;delivery_number:string|null;delivery_neighborhood:string|null;delivery_city:string|null};items:{status:string;id:string;name_snapshot:string;quantity:number;unit_price_cents:number;addons_cents:number;notes:string|null}[]};
const money=(v:number)=>((Number(v)||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function Comprovante(){
 const {organizations:orgs,organizationId:org,revision}=useOrganization();
 const [paper,setPaper]=useState('80');
 const {data:session,isPending}=authClient.useSession();
 const [order,setOrder]=useState(''),[detail,setDetail]=useState<Detail|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{setOrder(new URLSearchParams(window.location.search).get('orderId')||'');},[]);
 useEffect(()=>{if(!org||!order)return;apiFetch('/api/restaurant/order-detail?organizationId='+encodeURIComponent(org)+'&orderId='+encodeURIComponent(order),{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(setDetail).catch(()=>setMessage('Nao foi possivel carregar o pedido'))},[org,order]);
 if(isPending)return <main>Carregando...</main>;
 if(!session)return <main><a href="/login">Entrar</a></main>;
 return <main className="thermal-ticket" style={{maxWidth:420,margin:'auto',padding:20,color:'#111',fontFamily:'monospace'}}>
 <div className="no-print"><a href="/comandas">Voltar</a><label>Papel<select value={paper} onChange={e=>setPaper(e.target.value)}><option value="58">58 mm</option><option value="80">80 mm</option></select></label><button onClick={()=>window.print()} disabled={!detail}>Imprimir</button></div>
 {detail&&<article><h1 style={{textAlign:'center'}}>{orgs.find(o=>o.id===org)?.name||'MeuPedido'}</h1>{detail.establishment?.phone&&<p>{detail.establishment.phone}</p>}{detail.establishment?.address&&<p>{detail.establishment.address}</p>}<p style={{textAlign:'center'}}>Comprovante de pedido — nao fiscal</p><hr/><p>Pedido #{detail.order.order_number}</p><p>{new Date(detail.order.created_at).toLocaleString('pt-BR')}</p><p>Tipo: {detail.order.channel}</p><hr/>
 {detail.items.filter(i=>i.status!=='cancelado').map(i=><div key={i.id}><p>{i.quantity} x {i.name_snapshot} — {money((i.unit_price_cents+i.addons_cents)*i.quantity)}</p>{i.notes&&<small>{i.notes}</small>}</div>)}
 {detail.order.delivery_street&&<p>Entrega: {detail.order.delivery_street}, {detail.order.delivery_number} - {detail.order.delivery_neighborhood}, {detail.order.delivery_city}</p>}{detail.order.delivery_fee_cents>0&&<p>Taxa de entrega: {money(detail.order.delivery_fee_cents)}</p>}<hr/>{detail.order.discount_cents>0&&<p>Desconto: {money(detail.order.discount_cents)}</p>}{detail.payments?.map(p=><p key={p.id}>{p.method}: {money(p.amount_cents)}</p>)}<h2>Total: {money(detail.order.total_cents)}</h2><p>Pago: {money(detail.order.paid_cents)}</p><p>Saldo: {money(Math.max(0,detail.order.total_cents-Number(detail.order.paid_cents)))}</p><p style={{textAlign:'center'}}>{detail.establishment?.receipt_footer??'Obrigado pela preferência!'}</p></article>}
 <footer style={{textAlign:'center',fontSize:11,marginTop:20}}>MeuPedido · Kumo<br/>www.sistemakumo.com.br<br/>Comprovante não fiscal</footer>{message&&<p role="alert">{message}</p>}
 <style jsx global>{`@media print{.no-print{display:none!important}body{margin:0;background:#fff}@page{size:auto;margin:3mm}.app-page>main.thermal-ticket{width:${Number(paper)-6}mm!important;max-width:${Number(paper)-6}mm!important;font-family:monospace!important;font-size:11px!important}.thermal-ticket h1,.thermal-ticket h2{font-family:monospace;font-size:15px;letter-spacing:0}.thermal-ticket article{border:0!important;box-shadow:none}.thermal-ticket p{overflow-wrap:anywhere}}`}</style>
 </main>;
}
