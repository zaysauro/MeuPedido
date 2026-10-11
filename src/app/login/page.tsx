'use client';

import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

export default function LoginPage() {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const result=await authClient.signIn.email({email,password});
      if(result.error){setMessage('Não foi possível entrar. Confira suas credenciais.');return;}
      window.location.assign('/painel');
    } catch {setMessage('Não foi possível conectar ao serviço de autenticação.');}
    finally {setBusy(false);}
  }
  return <main style={{maxWidth:420,margin:'12vh auto',padding:24}}>
    <h1>Entrar no MeuPedido</h1>
    <p>Entre com sua conta para acessar o painel.</p>
    <form onSubmit={submit} style={{display:'grid',gap:14}}>
      <label>E-mail<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',padding:12,boxSizing:'border-box'}} /></label>
      <label>Senha<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:'block',width:'100%',padding:12,boxSizing:'border-box'}} /></label>
      <button type="submit" disabled={busy} style={{padding:14,background:'#17663c',color:'white',border:0,borderRadius:8}}>{busy?'Entrando...':'Entrar'}</button>
      {message&&<p role="alert">{message}</p>}
    </form>
    <p style={{fontSize:13}}>O cadastro público será liberado após a configuração de e-mail e proteção contra abuso.</p>
  </main>;
}
