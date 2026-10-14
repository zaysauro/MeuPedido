import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAuth } from '@/lib/auth';
import {OrganizationProvider} from '@/components/organization-provider';
import AppShell from '@/components/app-shell';
export const dynamic = 'force-dynamic';
export default async function PrivateLayout({children}:{children:React.ReactNode}) {
 const session=await createAuth().api.getSession({headers:await headers()});
 if(!session) redirect('/login');
 return <OrganizationProvider userId={session.user.id}><AppShell name={session.user.name}>{children}</AppShell></OrganizationProvider>;
}
