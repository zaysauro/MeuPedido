'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};
type Item={id:string;name:string;description:string|null;price_cents:number;category_name:string|null;available:boolean};
export default function MenuPage(){
 const {data:session,isPending}=authClient.useSession();
 const [orgs,setOrgs]=useState<Org[]>([]),[orgId,setOrgId]=useState(''),[items,setItems]=useState<Item[]>([]);
 const [name,setName]=useState(''),[price,setPrice]=useState(''),[description,setDescription]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!session)return;fetch('/api/organizations').then(r=>r.ok?r.json():Promise.reject()).then(d=>{setOrgs(d.organizations);setOrgId((old:string)=>old||d.organizations[0]?.id||'');}).catch(()=>setError('Falha ao carregar estabelecimentos.'));},[session]);
 async function load(id:string){if(!id)return;try{const r=await fetch('/api/menu?organizationId='+encodeURIComponent(id));if(!r.ok)throw Error();setItems((await r.json()).items);}catch{setError('Não foi possível carregar o cardápio.');}}
 useEffect(()=>{void load(orgId);},[orgId]);
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const cents=Math.round(Number(price.replace(',','.'))*100);if(!Number.isSafeInteger(cents)||cents<0)throw Error();const r=await fetch('/api/menu/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:orgId,name,description,priceCents:cents})});if(!r.ok)throw Error();setName('');setPrice('');setDescription('');await load(orgId);}catch{setError('Confira os dados e tente novamente.');}finally{setBusy(false);}}
 if(isPending)return <main style={{padding:32}}>Carregando...</main>;
 if(!session)return <main style={{padding:32}}><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:1000,margin:'40px auto',padding:24}}>
 <a href="/painel">← Painel</a><h1>Cardápio</h1><p>Cadastre produtos e organize os itens vendidos pelo estabelecimento.</p>
 <label>Estabelecimento <select value={orgId} onChange={e=>setOrgId(e.target.value)}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
 {!orgId?<p>Cadastre primeiro um estabelecimento no painel.</p>:<><form onSubmit={save} style={{display:'grid',gap:12,maxWidth:460,marginTop:24}}>
 <h2>Novo item</h2><label>Nome<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} style={{display:'block',width:'100%',padding:10}}/></label>
 <label>Preço (R$)<input required inputMode="decimal" placeholder="24,90" value={price} onChange={e=>setPrice(e.target.value)} style={{display:'block',width:'100%',padding:10}}/></label>
 <label>Descrição<textarea maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)} style={{display:'block',width:'100%',padding:10}}/></label>
 <button disabled={busy} style={{padding:12,background:'#17663c',color:'white',border:0,borderRadius:8}}>{busy?'Salvando...':'Adicionar ao cardápio'}</button></form>
 <h2>Itens cadastrados</h2>{items.length===0?<p>Nenhum item cadastrado.</p>:<ul>{items.map(i=><li key={i.id}><strong>{i.name}</strong> — {(i.price_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}{i.description?' — '+i.description:''}</li>)}</ul>}</>}
 {error&&<p role="alert">{error}</p>}
 </main>;
}
