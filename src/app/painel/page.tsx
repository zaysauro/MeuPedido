import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAuth } from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function Panel() {
  const session=await createAuth().api.getSession({headers:await headers()});
  if(!session) redirect('/login');
  return <main style={{maxWidth:850,margin:'8vh auto',padding:24}}>
    <h1>MeuPedido</h1><p>Bem-vindo, {session.user.name}.</p>
    <p>Seu acesso foi autenticado. O painel operacional está em desenvolvimento.</p>
  </main>;
}
