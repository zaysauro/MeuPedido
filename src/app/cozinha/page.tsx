'use client';
import {useEffect,useState} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};
type Order={id:string;order_number:number;channel:string;status:string;notes:string;table_label:string|null;created_at:string;items:{name:string;quantity:number;notes:string;addons:string[]}[]};
export default function Kitchen(){
 const {data:session,isPending}=authClient.useSession();
 const [orgs,setOrgs]=useState<Org[]>([]),[org,setOrg]=useState(''),[orders,setOrders]=useState<Order[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 useEffect(()=>{if(!session)return;fetch('/api/organizations').then(r=>r.json()).then(d=>{setOrgs(d.organizations||[]);setOrg(d.organizations?.[0]?.id||'')}).catch(()=>setError('Falha ao carregar estabelecimentos'))},[session]);
 useEffect(()=>{if(!org)return;let active=true;async function load(){try{const r=await fetch('/api/restaurant/kitchen?organizationId='+encodeURIComponent(org),{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(active){setOrders(d.orders||[]);setError('')}}catch{if(active)setError('Falha ao atualizar a cozinha. Verifique a migração 004.')}}void load();const timer=setInterval(()=>void load(),10000);return()=>{active=false;clearInterval(timer)}},[org]);
 async function advance(o:Order){const next=o.status==='recebido'?'preparando':o.status==='preparando'?'pronto':'entregue';setBusy(o.id);try{const r=await fetch('/api/restaurant/kitchen',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:org,orderId:o.id,status:next})});if(!r.ok)throw Error();setOrders(old=>old.map(x=>x.id===o.id?{...x,status:next}:x).filter(x=>x.status!=='entregue'))}catch{setError('Não foi possível atualizar o pedido')}finally{setBusy('')}}
 if(isPending)return <main style={{padding:24}}>Carregando...</main>;
 if(!session)return <main style={{padding:24}}><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:1200,margin:'30px auto',padding:24,color:'#173d2d'}}><a href="/painel">← Painel</a><h1>Cozinha · Pedidos em tempo real</h1><p>Atualização automática a cada 10 segundos.</p><label>Estabelecimento <select value={org} onChange={e=>setOrg(e.target.value)}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))',gap:16,marginTop:24}}>{orders.map(o=><article key={o.id} style={{padding:18,border:'2px solid #bad6c5',borderRadius:12,background:'white'}}><h2>Pedido #{o.order_number}</h2><p>{o.channel}{o.table_label?' · '+o.table_label:''} · <strong>{o.status}</strong></p><small>{new Date(o.created_at).toLocaleString('pt-BR')}</small><ul>{o.items.map((i,index)=><li key={index}><strong>{i.quantity}× {i.name}</strong>{i.addons?.length>0&&<div>Adicionais: {i.addons.join(', ')}</div>}{i.notes&&<div>Obs.: {i.notes}</div>}</li>)}</ul>{o.notes&&<p>Obs. geral: {o.notes}</p>}<button disabled={busy===o.id} onClick={()=>advance(o)} style={{background:'#17663c',color:'white',border:0,padding:12,borderRadius:8,width:'100%'}}>{o.status==='recebido'?'Iniciar preparo':o.status==='preparando'?'Marcar pronto':'Marcar entregue'}</button></article>)}</div>
 {!orders.length&&<p>Nenhum pedido aguardando preparo.</p>}{error&&<p role="alert" style={{color:'#a52323'}}>{error}</p>}</main>
}
