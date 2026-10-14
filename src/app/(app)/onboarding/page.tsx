'use client';
import {useState,type FormEvent} from 'react';
import {useOrganization} from '@/components/organization-provider';
import {PageHeader,Panel,Notice} from '@/components/ui';
import {apiFetch} from '@/lib/api-client';
export default function Onboarding(){const {organizationId,regularizationRequired,refreshOrganizations}=useOrganization();const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await apiFetch('/api/organizations/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});const d=await r.json();if(!r.ok)throw Error(d.error);await refreshOrganizations();}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir o cadastro.');}finally{setBusy(false);}}
if(organizationId||regularizationRequired)return <p>Consulte <a href="/configuracoes">Meu estabelecimento</a>.</p>;
return <main><PageHeader title="Cadastre seu estabelecimento" description="Conclua seu cadastro inicial. Cada conta proprietária possui um único estabelecimento e uma assinatura própria."/><Panel><form className="form-stack" onSubmit={submit}><label>Nome do estabelecimento<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><p>Você poderá editar os dados depois. Este cadastro não ativa cobranças.</p><button className="button-primary" disabled={busy}>{busy?'Cadastrando…':'Concluir cadastro'}</button>{error&&<Notice error>{error}</Notice>}</form></Panel></main>;}
