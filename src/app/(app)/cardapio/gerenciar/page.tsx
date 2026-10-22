'use client';
import {Dialog,PageHeader,EmptyState,useInteraction} from '@/components/ui';
import {useOrganization} from '@/components/organization-provider';
import {apiFetch} from '@/lib/api-client';
import {useEffect,useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};type Category={id:string;name:string};
type Product={id:string;name:string;description:string|null;price_cents:number;image_url:string|null;available:boolean;requires_preparation:boolean;category_name:string|null;category_id:string|null};
const empty={name:'',description:'',price:'',imageUrl:'',categoryId:'',available:true,requiresPreparation:true};
export default function GerenciarCardapio(){
 const {confirmAction,promptAction}=useInteraction();
 const {organizations:orgs,organizationId:org,revision}=useOrganization();
 const {data:session,isPending}=authClient.useSession();
 const [items,setItems]=useState<Product[]>([]),[categories,setCategories]=useState<Category[]>([]);
 const [showForm,setShowForm]=useState(false),[search,setSearch]=useState('');
 const [editing,setEditing]=useState(''),[form,setForm]=useState(empty),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 async function refresh(){if(!org)return;try{const [a,b]=await Promise.all([apiFetch('/api/menu?organizationId='+encodeURIComponent(org)),apiFetch('/api/restaurant?resource=categories&organizationId='+encodeURIComponent(org))]);if(!a.ok||!b.ok)throw Error();setItems((await a.json()).items||[]);setCategories((await b.json()).items||[])}catch{setMessage('Não foi possível carregar o cardápio.')}}
 useEffect(()=>{void refresh()},[org,revision]);
 function edit(i:Product){setShowForm(true);setEditing(i.id);setForm({name:i.name,description:i.description||'',price:(i.price_cents/100).toFixed(2).replace('.',','),imageUrl:i.image_url||'',categoryId:i.category_id||'',available:i.available,requiresPreparation:i.requires_preparation})}
 async function save(e:FormEvent){e.preventDefault();const price=Number(form.price.replace(',','.'));const priceCents=Math.round(price*100);if(!Number.isFinite(price)||!Number.isSafeInteger(priceCents)||priceCents<0){setMessage('Preço inválido.');return}setBusy(true);setMessage('');try{const r=await apiFetch('/api/menu/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:org,action:editing?'update':'create',itemId:editing||undefined,name:form.name,description:form.description,priceCents,imageUrl:form.imageUrl,categoryId:form.categoryId||null,available:form.available,requiresPreparation:form.requiresPreparation})});if(!r.ok)throw Error((await r.json()).error);setForm(empty);setEditing('');setShowForm(false);setMessage('Produto salvo.');await refresh()}catch(e){setMessage('Não foi possível salvar. Confira os dados e sua permissão administrativa.')}finally{setBusy(false)}}
 async function remove(i:Product){if(!await confirmAction('Excluir '+i.name+'? Produtos já vendidos devem ser desativados.'))return;setBusy(true);try{const r=await apiFetch('/api/menu/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:org,action:'delete',itemId:i.id})});if(!r.ok)throw Error((await r.json()).error);await refresh();setMessage('Produto excluído.')}catch(e){setMessage('Não foi possível excluir. Produtos vendidos devem ser marcados como indisponíveis.')}finally{setBusy(false)}}
 if(isPending)return <main style={{padding:24}}>Carregando...</main>;
 if(!session)return <main style={{padding:24}}><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:1100,margin:'30px auto',padding:24,color:'#173d2d'}}><a href="/painel">← Painel</a><PageHeader title="Cardápio" description="Produtos, preços e disponibilidade atualizados no PDV." actions={<button className="button-primary" onClick={()=>{setEditing('');setForm(empty);setShowForm(true);}}>＋ Novo produto</button>}/>
 <div className="catalog-manager">
 <section className="panel"><div className="filter-bar"><label>Buscar produto<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><a href="/operacao?resource=categories">Gerenciar categorias</a></div><h2>Produtos ({items.length})</h2>{!items.length&&<EmptyState title="Seu cardápio começa aqui"><p>Cadastre o primeiro produto e vincule seus ingredientes na ficha técnica.</p></EmptyState>}{items.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())).map(i=><article key={i.id} style={{display:'flex',alignItems:'center',gap:12,padding:12,borderBottom:'1px solid #ddd'}}>{i.image_url&&<img src={i.image_url} alt="" style={{width:55,height:55,objectFit:'cover',borderRadius:8}}/>}<div style={{flex:1}}><strong>{i.name}</strong><p style={{margin:2}}>{(i.price_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · {i.available?'Disponível':'Indisponível'}</p><small>{i.category_name||'Sem categoria'}</small></div><button onClick={()=>edit(i)}>Editar</button><button disabled={busy} onClick={()=>remove(i)}>Excluir</button></article>)}</section>
 {showForm&&<Dialog title={editing?'Editar produto':'Novo produto'} onClose={()=>setShowForm(false)}><form onSubmit={save} style={{display:'grid',gap:12}}>
 <label>Nome<input required maxLength={160} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={{display:'block',width:'100%',padding:10}}/></label>
 <label>Descrição<textarea maxLength={2000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{display:'block',width:'100%',padding:10}}/></label>
 <label>Preço (R$)<input required inputMode="decimal" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} style={{display:'block',width:'100%',padding:10}}/></label>
 <label>Categoria<select value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})} style={{display:'block',width:'100%',padding:10}}><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>URL da foto (HTTPS)<input type="url" value={form.imageUrl} onChange={e=>setForm({...form,imageUrl:e.target.value})} style={{display:'block',width:'100%',padding:10}}/></label>
 {form.imageUrl&&<img className="image-preview" src={form.imageUrl} alt="Prévia do produto" onError={e=>{e.currentTarget.style.display='none';}}/>}<p className="muted">Use uma URL HTTPS pública de imagem. Confira a prévia antes de salvar.</p><label><input type="checkbox" checked={form.available} onChange={e=>setForm({...form,available:e.target.checked})}/> Disponível para venda</label><label><input type="checkbox" checked={form.requiresPreparation} onChange={e=>setForm({...form,requiresPreparation:e.target.checked})}/> Exige preparo na cozinha</label>
 <button disabled={busy||!org} style={{padding:13,background:'#17663c',color:'white',border:0,borderRadius:8}}>{busy?'Salvando...':'Salvar produto'}</button>
 {editing&&<button type="button" onClick={()=>{setEditing('');setForm(empty);setShowForm(false)}}>Cancelar edição</button>}
 </form></Dialog>}</div>{message&&<p role="status">{message}</p>}</main>;
}
