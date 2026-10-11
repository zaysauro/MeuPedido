'use client';
import {authClient} from '@/lib/auth-client';
export default function LogoutButton(){return <button onClick={async()=>{await authClient.signOut();window.location.assign('/login');}} style={{padding:'10px 14px',border:'1px solid #ccd9d0',borderRadius:8,background:'white',cursor:'pointer'}}>Sair da conta</button>;}
