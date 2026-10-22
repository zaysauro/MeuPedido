'use client';
import Link from 'next/link';
import {useEffect,useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';

type User={name:string;email:string};
export default function InvitationPage(){
 const [token,setToken]=useState(''),[ready,setReady]=useState(false),[user,setUser]=useState<User|null>(null),[register,setRegister]=useState(false);
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{
  setToken(new URLSearchParams(window.location.hash.slice(1)).get('token')||'');
  let active=true;
  fetch('/api/invitations',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(active)setUser(data.user);})
   .catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setReady(true);});
  return()=>{active=false;};
 },[]);
 async function authenticate(e:FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
  try{
   const result=register?await authClient.signUp.email({name:name.trim(),email:email.trim().toLowerCase(),password}):await authClient.signIn.email({email:email.trim().toLowerCase(),password});
   if(result.error)throw Error(result.error.code==='EMAIL_NOT_VERIFIED'?'Confirme seu e-mail antes de entrar.':'Não foi possível entrar ou criar a conta. Confira os dados e tente novamente.');
   const response=await fetch('/api/invitations',{cache:'no-store'}),data=await response.json();
   if(!response.ok)throw Error(data.error);
   setUser(data.user);setPassword('');
   if(!data.user)setMessage('Confira seu e-mail para confirmar a conta e volte a este convite para entrar.');
  }catch(error){setError(error instanceof Error?error.message:'Não foi possível autenticar.');}finally{setBusy(false);}
 }
 async function accept(){
  if(busy)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/invitations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}),data=await response.json();
   if(!response.ok)throw Error(data.error);
   window.location.replace(data.destination);
  }catch(error){setError(error instanceof Error?error.message:'Não foi possível aceitar o convite.');setBusy(false);}
 }
 return <main className="auth-page"><section className="auth-card"><Link href="/">← MeuPedido</Link><h1>Entrar na equipe</h1>
 <p>Use o e-mail que recebeu o convite. Seu acesso será vinculado ao estabelecimento do proprietário.</p>
 {!ready?<p role="status">Verificando sua sessão…</p>:!token?<p role="alert">O link está incompleto. Peça ao proprietário um novo convite.</p>:user?<><p>Conectado como <strong>{user.name}</strong><br/>{user.email}</p>
 <button className="button-primary" disabled={busy} onClick={()=>void accept()}>{busy?'Vinculando acesso…':'Aceitar convite'}</button>
 <p><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const result=await authClient.signOut();if(result.error)throw Error();setUser(null);}catch{setError('Não foi possível sair. Tente novamente.');}finally{setBusy(false);}}}>Usar outra conta</button></p></>:<>
 <form onSubmit={authenticate}>
 {register&&<label>Seu nome<input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}
 <label>E-mail do convite<input required type="email" autoComplete="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Senha<input required type="password" minLength={8} autoComplete={register?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <button className="button-primary" disabled={busy}>{busy?'Aguarde…':register?'Criar minha conta individual':'Entrar na minha conta'}</button></form>
 <p><button disabled={busy} onClick={()=>{setRegister(!register);setError('');setMessage('');}}>{register?'Já tenho conta':'Ainda não tenho conta'}</button></p>
 <p><Link href="/recuperar-senha">Esqueci minha senha</Link></p></>}
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <p className="muted">O convite concede acesso à equipe. Não cria um novo estabelecimento nem uma assinatura.</p>
 </section></main>;
}
