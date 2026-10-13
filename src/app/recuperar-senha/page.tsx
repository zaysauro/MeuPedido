'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';
import Link from 'next/link';
export default function Recover(){
 const [email,setEmail]=useState(''),[ready,setReady]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{fetch('/api/auth-status',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('status');return r.json();}).then(d=>setReady(d.passwordRecoveryAvailable===true)).catch(()=>setReady(false));},[]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy||!ready)return;setBusy(true);setMessage('');
 try{const r=await authClient.requestPasswordReset({email:email.trim().toLowerCase(),redirectTo:window.location.origin+'/redefinir-senha'});setMessage(r.error?'Não foi possível processar a solicitação. Tente novamente em instantes.':'Se este e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.');}
 catch{setMessage('Não foi possível conectar ao serviço. Tente novamente.');}finally{setBusy(false);}
 }
 return <main className="auth-page"><section className="auth-card"><Link href="/login">← Voltar ao login</Link><h1>Recuperar senha</h1>
 {ready===null?<p>Verificando serviço de recuperação…</p>:ready?<><p>Informe seu e-mail cadastrado para receber um link de recuperação.</p><form onSubmit={submit}><label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><button disabled={busy}>{busy?'Enviando…':'Enviar link de recuperação'}</button></form></>:<><p>O envio de e-mails de recuperação ainda não foi configurado neste ambiente. A equipe da Kumo pode ajudar com o acesso.</p><a href="https://www.sistemakumo.com.br/#contato">Falar com o suporte</a></>}
 {message&&<p role="status" aria-live="polite">{message}</p>}</section></main>;
}
