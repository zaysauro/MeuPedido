'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};type Category={id:string;name:string};
type Product={id:string;name:string;description:string|null;price_cents:number;image_url:string|null;available:boolean;category_name:string|null;category_id:string|null};
const empty={name:'',description:'',price:'',imageUrl:'',categoryId:'',available:true};
export default function GerenciarCardapio(){
 const {data:session,isPending}=authClient.useSession();
 const [orgs,setOrgs]=useState<Org[]>([]),[org,setOrg]=useState(''),[items,setItems]=useState<Product[]>([]),[categories,setCategories]=useState<Category[]>([]);
 const [editing,setEditing]=useState(''),[form,setForm]=useState(empty),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(!session)return;fetch('/api/organizations').then(r=>r.json()).then(d=>{setOrgs(d.organizations||[]);setOrg(d.organizations?.find((o:Org)=>o.id===new URLSearchParams(window.location.search).get('organizationId'))?.id||d.organizations?.[0]?.id||'')}).catch(()=>setMessage('Não foi possível carregar estabelecimentos.'))},[session]);
 async function refresh(){if(!org)return;try{const [a,b]=await Promise.all([fetch('/api/menu?organizationId='+encodeURIComponent(org)),fetch('/api/restaurant?resource=categories&organizationId='+encodeURIComponent(org))]);if(!a.ok||!b.ok)throw Error();setItems((await a.json()).items||[]);setCategories((await b.json()).items||[])}catch{setMessage('Não foi possível carregar o cardápio.')}}
 useEffect(()=>{setEditing('');setForm(empty);void refresh()},[org]);
 function edit(i:Product){setEditing(i.id);setForm({name:i.name,description:i.description||'',price:(i.price_cents/100).toFixed(2).replace('.',','),imageUrl:i.image_url||'',categoryId:i.category_id||'',available:i.available})}
 async function save(e:FormEvent){e.preventDefault();const price=Number(form.price.replace(',','.'));const priceCents=Math.round(price*100);if(!Number.isFinite(price)||!Number.isSafeInteger(priceCents)||priceCents<0){setMessage('Preço inválido.');return}setBusy(true);setMessage('');try{const r=await fetch('/api/menu/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:org,action:editing?'update':'create',itemId:editing||undefined,name:form.name,description:form.description,priceCents,imageUrl:form.imageUrl,categoryId:form.categoryId||null,available:form.available})});if(!r.ok)throw Error((await r.json()).error);setForm(empty);setEditing('');setMessage('Produto salvo.');await refresh()}catch(e){setMessage(e instanceof Error?e.message:'Erro ao salvar')}finally{setBusy(false)}}
 async function remove(i:Product){if(!confirm('Excluir '+i.name+'? Produtos já vendidos devem ser desativados.'))return;setBusy(true);try{const r=await fetch('/api/menu/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:org,action:'delete',itemId:i.id})});if(!r.ok)throw Error((await r.json()).error);await refresh();setMessage('Produto excluído.')}catch(e){setMessage(e instanceof Error?e.message:'Erro ao excluir')}finally{setBusy(false)}}
 if(isPending)return <main style={{padding:24}}>Carregando...</main>;
 if(!session)return <main style={{padding:24}}><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:1100,margin:'30px auto',padding:24,color:'#173d2d'}}><a href="/painel">← Painel</a><h1>Gerenciar cardápio</h1><label>Estabelecimento <select value={org} onChange={e=>setOrg(e.target.value)}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:24,marginTop:24}}>
 <section><h2>Produtos ({items.length})</h2>{items.map(i=><article key={i.id} style={{display:'flex',alignItems:'center',gap:12,padding:12,borderBottom:'1px solid #ddd'}}>{i.image_url&&<img src={i.image_url} alt="" style={{width:55,height:55,objectFit:'cover',borderRadius:8}}/>}<div style={{flex:1}}><strong>{i.name}</strong><p style={{margin:2}}>{(i.price_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · {i.available?'Disponível':'Indisponível'}</p><small>{i.category_name||'Sem categoria'}</small></div><button onClick={()=>edit(i)}>Editar</button><button disabled={busy} onClick={()=>remove(i)}>Excluir</button></article>)}</section>
 <section><h2>{editing?'Editar produto':'Novo produto'}</h2><form onSubmit={save} style={{display:'grid',gap:12}}>
 <label>Nome<input required maxLength={160} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={{display:'block',width:'100%',padding:10}}/></label>
 <label>Descrição<textarea maxLength={2000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{display:'block',width:'100%',padding:10}}/></label>
 <label>Preço (R$)<input required inputMode="decimal" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} style={{display:'block',width:'100%',padding:10}}/></label>
 <label>Categoria<select value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})} style={{display:'block',width:'100%',padding:10}}><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>URL da foto (HTTPS)<input type="url" value={form.imageUrl} onChange={e=>setForm({...form,imageUrl:e.target.value})} style={{display:'block',width:'100%',padding:10}}/></label>
 <label><input type="checkbox" checked={form.available} onChange={e=>setForm({...form,available:e.target.checked})}/> Disponível para venda</label>
 <button disabled={busy||!org} style={{padding:13,background:'#17663c',color:'white',border:0,borderRadius:8}}>{busy?'Salvando...':'Salvar produto'}</button>
 {editing&&<button type="button" onClick={()=>{setEditing('');setForm(empty)}}>Cancelar edição</button>}
 </form></section></div>{message&&<p role="status">{message}</p>}</main>;
}
