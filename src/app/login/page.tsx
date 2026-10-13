'use client';
import Link from 'next/link';
import {useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';
export default function LoginPage(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setMessage('');
 try{const result=await authClient.signIn.email({email:email.trim(),password});if(result.error){setMessage('E-mail ou senha incorretos, ou serviço indisponível.');return;}window.location.assign('/painel');}
 catch{setMessage('Não foi possível conectar ao serviço de autenticação.');}finally{setBusy(false);}}
 return <main style={{minHeight:'100vh',background:'#f3faf5',padding:'70px 20px',fontFamily:'Arial,sans-serif',color:'#153328'}}>
 <div style={{maxWidth:430,margin:'auto',background:'white',padding:32,borderRadius:20,border:'1px solid #dfebe2'}}>
 <Link href="/" style={{color:'#176d43',textDecoration:'none'}}>← MeuPedido</Link><h1>Bem-vindo de volta</h1><p>Entre para gerenciar seu estabelecimento.</p>
 <form onSubmit={submit} style={{display:'grid',gap:16}}>
 <label>E-mail<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,marginTop:5}}/></label>
 <label>Senha<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,marginTop:5}}/></label>
 <button disabled={busy} style={{padding:14,background:'#176d43',color:'white',border:0,borderRadius:10,fontWeight:700}}>{busy?'Entrando...':'Entrar'}</button>{message&&<p role="alert" style={{color:'#a22'}}>{message}</p>}
 </form><p><Link href="/recuperar-senha">Esqueci minha senha</Link></p><p>Primeira vez aqui? <Link href="/cadastro">Criar conta</Link></p></div></main>;
}
