'use client';
import {PageHeader} from '@/components/ui';
import {useOrganization} from '@/components/organization-provider';
import {apiFetch} from '@/lib/api-client';
import {useEffect,useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};
type Row={id:string;name?:string;label?:string;unit?:string;quantity?:number;minimum_quantity?:number;phone?:string;order_number?:number;channel?:string;status?:string;payment_status?:string;total_cents?:number;table_label?:string};
type Resource='tables'|'categories'|'ingredients'|'customers'|'orders';
const labels:Record<Resource,string>={tables:'Mesas',categories:'Categorias',ingredients:'Ingredientes',customers:'Clientes',orders:'Pedidos'};
export default function Operacao(){
 const {organizations:orgs,organizationId:org,revision}=useOrganization();
 const {data:session,isPending}=authClient.useSession();
 const [resource,setResource]=useState<Resource>(()=>{const r=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('resource'):null;return ['tables','categories','ingredients','customers','orders'].includes(r||'')?r as Resource:'tables';});
 const [rows,setRows]=useState<Row[]>([]),[name,setName]=useState(''),[unit,setUnit]=useState('un'),[quantity,setQuantity]=useState('0'),[minimum,setMinimum]=useState('0'),[phone,setPhone]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');

 useEffect(()=>{if(!org)return;let active=true;setError('');apiFetch('/api/restaurant?organizationId='+encodeURIComponent(org)+'&resource='+resource).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(active)setRows(d.items||[])}).catch(()=>{if(active)setError('Não foi possível carregar. Atualize a página ou fale com o suporte.')});return()=>{active=false}},[org,resource,revision]);
 async function submit(e:FormEvent){e.preventDefault();if(!org)return;setBusy(true);setError('');try{
 const payload={resource,organizationId:org,name,unit,quantity:Number(quantity.replace(',','.')),minimumQuantity:Number(minimum.replace(',','.')),phone};
 const r=await apiFetch('/api/restaurant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 if(!r.ok)throw Error((await r.json()).error||'Erro ao salvar');
 setName('');setPhone('');const list=await apiFetch('/api/restaurant?organizationId='+encodeURIComponent(org)+'&resource='+resource);if(!list.ok)throw Error('Falha ao atualizar');setRows((await list.json()).items||[]);
 }catch(e){setError(e instanceof Error?e.message:'Erro ao salvar')}finally{setBusy(false)}}
 if(isPending)return <main style={{padding:32}}>Carregando...</main>;
 if(!session)return <main style={{padding:32}}><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:1100,margin:'32px auto',padding:24,color:'#16392c'}}>
 <a href="/painel">← Painel</a><PageHeader title="Cadastros da operação" description="Organize mesas, categorias e ingredientes do estabelecimento ativo."/><p>Gerencie mesas, ingredientes, categorias, clientes e acompanhe pedidos.</p>

 <nav aria-label="Módulos" style={{display:'flex',flexWrap:'wrap',gap:8,margin:'22px 0'}}>{(Object.keys(labels) as Resource[]).map(k=><button key={k} onClick={()=>setResource(k)} style={{padding:'10px 16px',borderRadius:9,border:'1px solid #bed6c8',background:resource===k?'var(--green-dark)':'var(--white)',color:'var(--ink)',cursor:'pointer'}}>{labels[k]}</button>)}</nav>
 {resource!=='orders'&&org&&<form onSubmit={submit} style={{padding:20,border:'1px solid #d7e5dc',borderRadius:12,display:'flex',flexWrap:'wrap',gap:12,alignItems:'end'}}>
 <label>Nome {resource==='tables'?'da mesa':''}<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)} style={{display:'block',padding:10}}/></label>
 {resource==='customers'&&<label>Telefone<input maxLength={40} value={phone} onChange={e=>setPhone(e.target.value)} style={{display:'block',padding:10}}/></label>}
 {resource==='ingredients'&&<><label>Unidade<select value={unit} onChange={e=>setUnit(e.target.value)} style={{display:'block',padding:10}}>{['un','g','kg','ml','l'].map(v=><option key={v}>{v}</option>)}</select></label><label>Saldo inicial<input required type="number" step=".001" min="0" value={quantity} onChange={e=>setQuantity(e.target.value)} style={{display:'block',padding:10}}/></label><label>Estoque mínimo<input required type="number" step=".001" min="0" value={minimum} onChange={e=>setMinimum(e.target.value)} style={{display:'block',padding:10}}/></label></>}
 <button disabled={busy} style={{background:'#17663c',color:'white',border:0,borderRadius:8,padding:12}}>{busy?'Salvando...':'Cadastrar'}</button></form>}
 <h2>{labels[resource]} ({rows.length})</h2>
 {!rows.length?<p>Nenhum registro encontrado.</p>:<div style={{display:'grid',gap:10}}>{rows.map(row=><article key={row.id} style={{padding:15,border:'1px solid #d7e5dc',borderRadius:10,background:'var(--white)'}}>
 <strong>{row.name||row.label||(row.order_number?'Pedido #'+row.order_number:'Registro')}</strong>
 {resource==='ingredients'&&<span> · {row.quantity} {row.unit} {Number(row.quantity)<=Number(row.minimum_quantity)?' · Estoque baixo':''}</span>}
 {resource==='customers'&&<span> · {row.phone||'Sem telefone'}</span>}
 {resource==='orders'&&<span> · {row.channel} · {row.status} · {row.payment_status} · {((row.total_cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span>}
 </article>)}</div>}
 {error&&<p role="alert" style={{color:'inherit'}}>{error}</p>}
 </main>
}
