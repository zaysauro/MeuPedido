'use client';
import {useState} from 'react';
import {authClient} from '@/lib/auth-client';

export default function LogoutButton(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function logout(){
  if(busy)return;
  setBusy(true);setError('');
  try{
   if('serviceWorker' in navigator){
    try{
     const registration=await navigator.serviceWorker.getRegistration('/');
     const subscription=await registration?.pushManager?.getSubscription();
     if(subscription){
      // Stop browser delivery even if the session has expired or the server is unreachable.
      await subscription.unsubscribe();
      await fetch('/api/push/subscriptions',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:subscription.endpoint}),signal:AbortSignal.timeout(4000)});
     }
     const notifications=await registration?.getNotifications();
     notifications?.forEach(notification=>notification.close());
    }catch{/* Signing out remains available; expired subscriptions are removed on provider 404/410. */}
   }
   const result=await authClient.signOut();
   if(result.error)throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
   window.location.assign('/login');
  }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível encerrar a sessão.');setBusy(false);}
 }
 return <div><button disabled={busy} onClick={()=>void logout()} style={{padding:'10px 14px',border:'1px solid #ccd9d0',borderRadius:8,background:'white',cursor:'pointer'}}>{busy?'Saindo…':'Sair da conta'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
