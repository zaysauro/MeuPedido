'use client';
import {useEffect,useState} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};
type Report={sales:{orders:number;total_cents:number;average_cents:string;paid_orders:number};methods:{method:string;payments:number;amount_cents:number}[];products:{name:string;units:number;amount_cents:number}[]};
const money=(n:number)=>((Number(n)||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today=()=>new Date().toLocaleDateString('en-CA');
export default function Relatorios(){
 const {data:session,isPending}=authClient.useSession();
 const [orgs,setOrgs]=useState<Org[]>([]),[org,setOrg]=useState(''),[start,setStart]=useState(today()),[end,setEnd]=useState(today()),[data,setData]=useState<Report|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{if(!session)return;fetch('/api/organizations').then(r=>r.json()).then(d=>{setOrgs(d.organizations||[]);setOrg(d.organizations?.[0]?.id||'')}).catch(()=>setMessage('Falha ao carregar estabelecimentos.'))},[session]);
 async function load(){if(!org)return;setMessage('');try{const q=new URLSearchParams({organizationId:org,start,end});const r=await fetch('/api/restaurant/reports?'+q,{cache:'no-store'});if(!r.ok)throw Error();setData(await r.json())}catch{setMessage('Não foi possível consultar os relatórios.');setData(null)}}
 useEffect(()=>{void load()},[org,start,end]);
 function exportCsv(){if(!data)return;const rows=[['Tipo','Descrição','Quantidade','Valor (centavos)'],...data.methods.map(m=>['Pagamento',m.method,String(m.payments),String(m.amount_cents)]),...data.products.map(p=>['Produto',p.name,String(p.units),String(p.amount_cents)])];const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='meupedido-relatorio-'+start+'-'+end+'.csv';a.click();URL.revokeObjectURL(url)}
 if(isPending)return <main style={{padding:24}}>Carregando...</main>;
 if(!session)return <main style={{padding:24}}><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:1050,margin:'30px auto',padding:24,color:'#173d2d'}}><a href="/painel">← Painel</a><h1>Relatórios de vendas</h1>
 <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'end'}}><label>Estabelecimento<select value={org} onChange={e=>setOrg(e.target.value)} style={{display:'block',padding:8}}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>De<input type="date" value={start} onChange={e=>setStart(e.target.value)} style={{display:'block',padding:8}}/></label><label>Até<input type="date" value={end} onChange={e=>setEnd(e.target.value)} style={{display:'block',padding:8}}/></label><button onClick={load}>Atualizar</button><button disabled={!data} onClick={exportCsv}>Exportar CSV</button></div>
 {data&&<><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginTop:24}}>{[['Pedidos',data.sales.orders],['Faturamento bruto',money(data.sales.total_cents)],['Ticket médio',money(Number(data.sales.average_cents))],['Pedidos pagos',data.sales.paid_orders]].map(([label,value])=><div key={label} style={{padding:20,border:'1px solid #c9ded2',borderRadius:12}}><small>{label}</small><h2>{value}</h2></div>)}</div>
 <h2>Pagamentos registrados</h2>{data.methods.map(m=><p key={m.method}>{m.method}: {money(m.amount_cents)} ({m.payments} registros)</p>)}
 <h2>Produtos mais vendidos</h2>{data.products.map(p=><p key={p.name}>{p.name}: {p.units} unidades · {money(p.amount_cents)}</p>)}
 <p style={{fontSize:13}}>Faturamento bruto por data de criação dos pedidos; pagamentos agrupados pela data em que foram registrados. Não representa fluxo de caixa conciliado nem lucro líquido.</p></>}
 {message&&<p role="status">{message}</p>}</main>;
}
