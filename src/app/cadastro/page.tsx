'use client';
import Link from 'next/link';
import {useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';
export default function Register(){
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setError('');setBusy(true);try{
 const result=await authClient.signUp.email({name,email,password});
 if(result.error){setError('Não foi possível criar a conta. Confira os dados ou tente entrar.');return;}
 if(!result.data?.token){setError('Confira seu e-mail para confirmar a conta antes de entrar.');return;}window.location.assign('/onboarding');
 }catch{setError('Falha ao conectar com o serviço de cadastro.');}finally{setBusy(false);}}
 return <main className="auth-page">
 <div className="auth-card">
 <Link href="/" style={{color:'var(--green)',textDecoration:'none'}}>← MeuPedido</Link><h1>Crie sua conta</h1><p>Comece cadastrando seu estabelecimento.</p>
 <form onSubmit={submit} style={{display:'grid',gap:16}}>
 <label>Seu nome<input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,marginTop:5}}/></label>
 <label>E-mail<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,marginTop:5}}/></label>
 <label>Senha (mínimo 8 caracteres)<input required type="password" autoComplete="new-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,marginTop:5}}/></label>
 <button disabled={busy} style={{padding:14,background:'var(--green)',color:'#152218',border:0,borderRadius:10,fontWeight:700}}>{busy?'Criando conta...':'Criar conta'}</button>
 {error&&<p role="alert" >{error}</p>}
 </form><p style={{fontSize:13,color:'var(--muted)'}}>Ao criar sua conta, você inicia a avaliação operacional do MeuPedido, sem cobrança automática.</p>
 <p>Já tem conta? <Link href="/login">Entrar</Link></p></div></main>;
}
