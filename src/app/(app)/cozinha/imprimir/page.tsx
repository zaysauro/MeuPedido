'use client';
import {useOrganization} from '@/components/organization-provider';
import {apiFetch} from '@/lib/api-client';
import {useEffect,useState} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};
type Order={id:string;order_number:number;channel:string;status:string;notes:string|null;table_label:string|null;created_at:string;items:{name:string;quantity:number;notes:string|null;addons:string[]}[]};
export default function ImprimirCozinha(){
 const {organizations:orgs,organizationId:org,revision}=useOrganization();
 const [paper,setPaper]=useState('80');
 const {data:session,isPending}=authClient.useSession();
 const [orderId,setOrderId]=useState(''),[order,setOrder]=useState<Order|null>(null),[error,setError]=useState('');
 useEffect(()=>{setOrderId(new URLSearchParams(window.location.search).get('orderId')||'');},[]);
 useEffect(()=>{if(!org||!orderId)return;apiFetch('/api/restaurant/kitchen?organizationId='+encodeURIComponent(org),{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{const found=(d.orders||[]).find((o:Order)=>o.id===orderId);if(found)setOrder(found);else setError('Pedido nao encontrado entre os pedidos ativos')}).catch(()=>setError('Nao foi possivel carregar pedido'))},[org,orderId]);
 if(isPending)return <main>Carregando...</main>;
 if(!session)return <main><a href="/login">Entrar</a></main>;
 return <main className="thermal-ticket" style={{maxWidth:360,margin:'auto',padding:18,fontFamily:'monospace',color:'#111'}}>
 <div className="no-print"><a href="/cozinha">Voltar a cozinha</a><label>Papel<select value={paper} onChange={e=>setPaper(e.target.value)}><option value="58">58 mm</option><option value="80">80 mm</option></select></label><button disabled={!order} onClick={()=>window.print()}>Imprimir pedido</button></div>
 {order&&<article><h1>COZINHA #{order.order_number}</h1><p>{orgs.find(o=>o.id===org)?.name}</p><p>{new Date(order.created_at).toLocaleString('pt-BR')}</p><p>{order.channel} {order.table_label||''}</p><hr/>
 {order.items.map((i,k)=><section key={k}><h2>{i.quantity} x {i.name}</h2>{i.addons?.length>0&&<p>Adicionais: {i.addons.join(', ')}</p>}{i.notes&&<p>Obs.: {i.notes}</p>}</section>)}
 {order.notes&&<p>OBS. GERAL: {order.notes}</p>}<hr/><p>Pedido para preparo — não fiscal</p><p>MeuPedido · Kumo<br/>www.sistemakumo.com.br</p></article>}
 {error&&<p role="alert">{error}</p>}
 <style jsx global>{`@media print{.no-print{display:none!important}@page{size:auto;margin:3mm}.app-page>main.thermal-ticket{width:${Number(paper)-6}mm!important;max-width:${Number(paper)-6}mm!important;font-family:monospace!important;font-size:11px!important}.thermal-ticket h1,.thermal-ticket h2{font-family:monospace;font-size:15px;letter-spacing:0}.thermal-ticket article{border:0!important;box-shadow:none}.thermal-ticket p{overflow-wrap:anywhere}body{background:white;margin:0}}`}</style>
 </main>;
}
