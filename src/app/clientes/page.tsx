'use client';
import {useEffect,useState} from 'react';
import {authClient} from '@/lib/auth-client';
type Org={id:string;name:string};
type Customer={id:string;name:string;phone:string|null};
export default function Clientes(){
 const {data:session,isPending}=authClient.useSession();
 const [orgs,setOrgs]=useState<Org[]>([]),[org,setOrg]=useState(''),[customers,setCustomers]=useState<Customer[]>([]);
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(!session)return;fetch('/api/organizations').then(r=>r.json()).then(d=>{setOrgs(d.organizations||[]);setOrg(d.organizations?.[0]?.id||'')}).catch(()=>setMessage('Erro ao carregar estabelecimentos'))},[session]);
 async function refresh(){if(!org)return;try{const r=await fetch('/api/restaurant?resource=customers&organizationId='+encodeURIComponent(org));if(!r.ok)throw Error();setCustomers((await r.json()).items||[])}catch{setMessage('Erro ao carregar clientes')}}
 useEffect(()=>{void refresh()},[org]);
 async function save(){if(!org||!name.trim())return;setBusy(true);try{const r=await fetch('/api/restaurant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resource:'customers',organizationId:org,name:name.trim(),phone:phone.trim()})});if(!r.ok)throw Error();setName('');setPhone('');await refresh();setMessage('Cliente cadastrado')}catch{setMessage('Erro ao cadastrar cliente')}finally{setBusy(false)}}
 if(isPending)return <main>Carregando...</main>;
 if(!session)return <main><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:900,margin:'auto',padding:24}}><a href="/painel">Voltar ao painel</a><h1>Clientes</h1>
 <label>Estabelecimento <select value={org} onChange={e=>setOrg(e.target.value)}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
 <h2>Cadastrar cliente</h2><input aria-label="Nome" placeholder="Nome" maxLength={160} value={name} onChange={e=>setName(e.target.value)}/><input aria-label="Telefone" placeholder="Telefone" maxLength={40} value={phone} onChange={e=>setPhone(e.target.value)}/><button disabled={busy||!org||!name.trim()} onClick={save}>Salvar</button>
 <h2>Consultar clientes</h2><input aria-label="Buscar" placeholder="Buscar" value={search} onChange={e=>setSearch(e.target.value)}/>
 {customers.filter(c=>(c.name+' '+(c.phone||'')).toLowerCase().includes(search.toLowerCase())).map(c=><p key={c.id}>{c.name} — {c.phone||'Sem telefone'}</p>)}
 {message&&<p role="status">{message}</p>}</main>;
}
