'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import LogoutButton from '@/components/logout-button';
type Org = {id:string;name:string;slug:string;role:string};
export default function OrganizationSetup() {
  const {data:session,isPending}=authClient.useSession();
  const [organizations,setOrganizations]=useState<Org[]>([]);
  const [name,setName]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{if(session)fetch('/api/organizations').then(r=>r.ok?r.json():Promise.reject()).then(d=>setOrganizations(d.organizations)).catch(()=>setError('Não foi possível carregar seus estabelecimentos.'));},[session]);
  async function submit(e:FormEvent) {
    e.preventDefault();setBusy(true);setError('');
    try {const r=await fetch('/api/organizations/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});if(!r.ok)throw Error();const d=await r.json();setOrganizations(a=>[...a,{...d.organization,role:'owner'}]);setName('');}
    catch {setError('Não foi possível cadastrar o estabelecimento.');}
    finally {setBusy(false);}
  }
  if(isPending)return <main style={{padding:32}}>Carregando...</main>;
  if(!session)return <main style={{padding:32}}><h1>MeuPedido</h1><a href="/login">Entre para continuar</a></main>;
  return <main style={{maxWidth:720,margin:'8vh auto',padding:24}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16}}><h1>Olá, {session.user.name}</h1><LogoutButton /></div><nav style={{display:"flex",gap:16,flexWrap:"wrap",margin:"20px 0"}}><a href="/cardapio">Cardápio →</a><a href="/cardapio/gerenciar">Produtos →</a><a href="/fichas-tecnicas">Fichas técnicas →</a><a href="/operacao">Operação →</a><a href="/mesas">Mesas →</a><a href="/pdv">PDV →</a><a href="/cozinha">Cozinha →</a><a href="/comandas">Comandas →</a><a href="/clientes">Clientes →</a><a href="/entregas">Entregas →</a><a href="/estoque">Estoque →</a><a href="/caixa">Caixa →</a><a href="/relatorios">Relatórios →</a></nav><h2>Seus estabelecimentos</h2>
    {organizations.length===0?<p>Cadastre seu primeiro estabelecimento.</p>:<ul>{organizations.map(o=><li key={o.id}>{o.name} — {o.role}</li>)}</ul>}
    <form onSubmit={submit} style={{display:'grid',gap:12,maxWidth:420}}>
      <label>Nome do estabelecimento<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={160} required style={{display:'block',width:'100%',padding:10}} /></label>
      <button disabled={busy} type="submit" style={{padding:12,background:'#17663c',color:'white',border:0,borderRadius:8}}>{busy?'Salvando...':'Cadastrar estabelecimento'}</button>
    </form>{error&&<p role="alert">{error}</p>}
    <p>Pedidos, mesas e cozinha estão em desenvolvimento e dependem das migrações 004 a 021 no Neon.</p>
  </main>;
}
