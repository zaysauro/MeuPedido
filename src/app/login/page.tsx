'use client';
import Link from 'next/link';
import {useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';

function loginError(code?:string,status?:number){
 if(status===429||code==='TOO_MANY_REQUESTS')return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
 if(code==='EMAIL_NOT_VERIFIED')return 'Seu e-mail ainda não foi confirmado. Confira sua caixa de entrada.';
 if(status && status>=500)return 'O serviço de autenticação está temporariamente indisponível. Tente novamente em instantes.';
 if(code==='INVALID_EMAIL_OR_PASSWORD'||code==='INVALID_PASSWORD'||code==='USER_NOT_FOUND'||status===401)return 'E-mail ou senha incorretos.';
 return 'Não foi possível entrar. Confira seus dados e tente novamente.';
}
export default function LoginPage(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setMessage('');
 try{
 const result=await authClient.signIn.email({email:email.trim().toLowerCase(),password});
 if(result.error){setMessage(loginError(result.error.code,result.error.status));return;}
 window.location.assign('/painel');
 }catch{setMessage('Não foi possível conectar ao serviço de autenticação. Tente novamente.');}finally{setBusy(false);}
 }
 return <main className="auth-page"><section className="auth-card">
 <Link href="/">← MeuPedido</Link><h1>Bem-vindo de volta</h1><p>Entre para gerenciar seu estabelecimento.</p>
 <form onSubmit={submit}><label>E-mail<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Senha<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <button disabled={busy} type="submit">{busy?'Entrando…':'Entrar'}</button>
 {message&&<p role="alert" aria-live="polite" style={{color:'#b42318'}}>{message}</p>}</form>
 <p><Link href="/recuperar-senha">Esqueci minha senha</Link></p><p>Primeira vez aqui? <Link href="/cadastro">Criar conta</Link></p>
 </section></main>;
}
