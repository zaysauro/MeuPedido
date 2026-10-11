'use client';
import {useEffect,useState} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};
type Table={id:string;label:string;active:boolean};
type Order={id:string;order_number:number;table_label:string|null;status:string;payment_status:string;total_cents:number};
export default function Mesas(){
 const {data:session,isPending}=authClient.useSession();
 const [orgs,setOrgs]=useState<Org[]>([]),[org,setOrg]=useState(''),[tables,setTables]=useState<Table[]>([]),[orders,setOrders]=useState<Order[]>([]),[message,setMessage]=useState('');
 useEffect(()=>{if(!session)return;fetch('/api/organizations').then(r=>r.json()).then(d=>{setOrgs(d.organizations||[]);setOrg(d.organizations?.[0]?.id||'')}).catch(()=>setMessage('Falha ao carregar estabelecimentos.'))},[session]);
 async function refresh(){if(!org)return;try{const q=encodeURIComponent(org);const [a,b]=await Promise.all([fetch('/api/restaurant?resource=tables&organizationId='+q,{cache:'no-store'}),fetch('/api/restaurant?resource=orders&organizationId='+q,{cache:'no-store'})]);if(!a.ok||!b.ok)throw Error();setTables((await a.json()).items||[]);setOrders((await b.json()).items||[])}catch{setMessage('Falha ao carregar mesas e comandas.')}}
 useEffect(()=>{void refresh()},[org]);
 if(isPending)return <main style={{padding:24}}>Carregando...</main>;
 if(!session)return <main style={{padding:24}}><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:1050,margin:'30px auto',padding:24,color:'#173d2d'}}><a href="/painel">← Painel</a><h1>Mapa de mesas</h1>
 <div style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}><label>Estabelecimento <select value={org} onChange={e=>setOrg(e.target.value)}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><button onClick={refresh}>Atualizar</button><a href="/operacao">Cadastrar mesas</a><a href="/pdv">Novo pedido</a></div>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:16,marginTop:26}}>{tables.filter(t=>t.active).map(t=>{const active=orders.filter(o=>o.table_label===t.label&&!['entregue','cancelado'].includes(o.status)&&o.payment_status!=='pago');return <article key={t.id} style={{border:'2px solid '+(active.length?'#df9b32':'#91c9a9'),background:active.length?'#fff6e7':'#effaf3',padding:18,borderRadius:14,minHeight:145}}><h2 style={{marginTop:0}}>{t.label}</h2><strong>{active.length?'Ocupada':'Livre'}</strong><p>{active.length} comanda(s) aberta(s)</p>{active.map(o=><a key={o.id} href={'/comandas?orderId='+encodeURIComponent(o.id)} style={{display:'block',marginTop:8}}>#{o.order_number} · {(o.total_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</a>)}</article>})}</div>
 {!tables.length&&<p>Nenhuma mesa cadastrada. Use a página Operação para criar mesas.</p>}
 <p style={{fontSize:13}}>A ocupação considera as comandas recentes retornadas pelo servidor; a listagem de pedidos é limitada a 150 registros.</p>{message&&<p role="status">{message}</p>}</main>;
}
