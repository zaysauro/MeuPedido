'use client';
import {useEffect,useState} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};type Menu={id:string;name:string;price_cents:number};
type Ingredient={id:string;name:string;unit:string;cost_per_unit_cents:string};
type Recipe={ingredient_id:string;quantity:string};
export default function FichasTecnicas(){
 const {data:session,isPending}=authClient.useSession();
 const [orgs,setOrgs]=useState<Org[]>([]),[org,setOrg]=useState(''),[menu,setMenu]=useState<Menu[]>([]),[ingredients,setIngredients]=useState<Ingredient[]>([]),[product,setProduct]=useState(''),[recipe,setRecipe]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(!session)return;fetch('/api/organizations').then(r=>r.json()).then(d=>{setOrgs(d.organizations||[]);setOrg(d.organizations?.find((o:Org)=>o.id===new URLSearchParams(window.location.search).get('organizationId'))?.id||d.organizations?.[0]?.id||'')}).catch(()=>setMessage('Erro ao carregar estabelecimentos.'))},[session]);
 useEffect(()=>{if(!org)return;setProduct('');setRecipe({});Promise.all([fetch('/api/menu?organizationId='+encodeURIComponent(org)),fetch('/api/restaurant/inventory?organizationId='+encodeURIComponent(org))]).then(async([a,b])=>{if(!a.ok||!b.ok)throw Error();setMenu((await a.json()).items||[]);setIngredients((await b.json()).items||[])}).catch(()=>setMessage('Erro ao carregar ingredientes e produtos.'))},[org]);
 useEffect(()=>{if(!org||!product)return;fetch('/api/restaurant/recipes?organizationId='+encodeURIComponent(org)+'&menuItemId='+encodeURIComponent(product)).then(r=>r.json()).then(d=>{const next:Record<string,string>={};for(const x of (d.ingredients||[]) as Recipe[])next[x.ingredient_id]=String(x.quantity);setRecipe(next)}).catch(()=>setMessage('Erro ao carregar ficha técnica.'))},[org,product]);
 const cost=ingredients.reduce((n,i)=>{const q=Number((recipe[i.id]||'0').replace(',','.'));return n+(Number.isFinite(q)?q*Number(i.cost_per_unit_cents):0)},0);
 async function save(){if(!product)return;const lines=[];for(const [ingredientId,value] of Object.entries(recipe)){if(!value.trim())continue;const quantity=Number(value.replace(',','.'));if(!Number.isFinite(quantity)||quantity<=0){setMessage('Quantidade inválida.');return}lines.push({ingredientId,quantity})}setBusy(true);setMessage('');try{const r=await fetch('/api/restaurant/recipes',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:org,menuItemId:product,ingredients:lines})});if(!r.ok)throw Error();setMessage('Ficha técnica salva.')}catch{setMessage('Não foi possível salvar. Tente atualizar a página ou fale com o suporte.')}finally{setBusy(false)}}
 if(isPending)return <main style={{padding:24}}>Carregando...</main>;
 if(!session)return <main style={{padding:24}}><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:900,margin:'30px auto',padding:24,color:'#173d2d'}}><a href="/painel">← Painel</a><h1>Fichas técnicas</h1><p>Defina quanto de cada ingrediente é consumido por unidade vendida.</p>
 <label>Estabelecimento <select value={org} onChange={e=>setOrg(e.target.value)}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
 <label style={{display:'block',marginTop:18}}>Produto <select value={product} onChange={e=>setProduct(e.target.value)} style={{padding:10,width:'100%',display:'block'}}><option value="">Selecione um produto</option>{menu.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
 {product&&<section style={{marginTop:24}}><h2>Ingredientes por unidade</h2>{ingredients.map(i=><label key={i.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:12,borderBottom:'1px solid #ddd'}}><span>{i.name} <small>({i.unit})</small></span><input inputMode="decimal" placeholder="0" value={recipe[i.id]||''} onChange={e=>setRecipe(old=>({...old,[i.id]:e.target.value}))} style={{width:110,padding:10}}/></label>)}
 <h3>Custo estimado: {(cost/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</h3><p style={{fontSize:13}}>O custo depende dos valores unitários cadastrados. Esta tela não efetua baixa automática no estoque.</p>
 <button disabled={busy} onClick={save} style={{padding:14,background:'#17663c',color:'white',border:0,borderRadius:8}}>{busy?'Salvando...':'Salvar ficha técnica'}</button></section>}
 {message&&<p role="status">{message}</p>}</main>;
}
