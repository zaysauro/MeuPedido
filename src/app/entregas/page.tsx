'use client';
import {useEffect,useState} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};
type Delivery={id:string;order_number:number;kitchen_status:string;delivery_status:string;customer_name:string|null;street:string|null;number:string|null;city:string|null;driver_name:string|null};
export default function Entregas(){
 const {data:session,isPending}=authClient.useSession();
 const [orgs,setOrgs]=useState<Org[]>([]),[org,setOrg]=useState(''),[orders,setOrders]=useState<Delivery[]>([]),[message,setMessage]=useState('');
 useEffect(()=>{if(!session)return;fetch('/api/organizations').then(r=>r.json()).then(d=>{setOrgs(d.organizations||[]);setOrg(d.organizations?.[0]?.id||'')})},[session]);
 async function load(){if(!org)return;const r=await fetch('/api/restaurant/delivery?organizationId='+org,{cache:'no-store'});if(r.ok)setOrders((await r.json()).deliveries||[]);else setMessage('Erro ao consultar entregas')}
 useEffect(()=>{void load()},[org]);
 async function advance(id:string,status:string){const r=await fetch('/api/restaurant/delivery',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:org,orderId:id,status})});if(!r.ok)setMessage('Transicao recusada');else await load()}
 if(isPending)return <main>Carregando...</main>;
 if(!session)return <main><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:1000,margin:'auto',padding:24}}><a href="/painel">Painel</a><h1>Entregas</h1><select value={org} onChange={e=>setOrg(e.target.value)}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><button onClick={load}>Atualizar</button>
 {orders.map(o=><article key={o.id} style={{border:'1px solid #ddd',padding:16,marginTop:12}}><h2>Pedido #{o.order_number}</h2><p>{o.customer_name} · {o.street}, {o.number} — {o.city}</p><p>Cozinha: {o.kitchen_status} · Entrega: {o.delivery_status}</p>
 {o.delivery_status==='aguardando'&&<button disabled={!['pronto','entregue'].includes(o.kitchen_status)} onClick={()=>advance(o.id,'despachado')}>Despachar</button>}
 {o.delivery_status==='despachado'&&<button onClick={()=>advance(o.id,'em_rota')}>Em rota</button>}
 {o.delivery_status==='em_rota'&&<button onClick={()=>advance(o.id,'entregue')}>Entregue</button>}
 {['despachado','em_rota'].includes(o.delivery_status)&&<button onClick={()=>advance(o.id,'falhou')}>Falha</button>}
 {o.delivery_status==='falhou'&&<button onClick={()=>advance(o.id,'despachado')}>Reenviar</button>}</article>)}
 {message&&<p role="alert">{message}</p>}</main>;
}
