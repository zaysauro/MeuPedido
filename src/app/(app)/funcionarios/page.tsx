'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {useOrganization} from '@/components/organization-provider';
import {PageHeader,Panel,Notice,useInteraction} from '@/components/ui';
import {apiFetch} from '@/lib/api-client';

type StaffRole='manager'|'cashier'|'waiter'|'kitchen';
type Member={user_id:string;name:string;email:string;role:string;revoked_at:string|null;permissions:string[]};
type Invitation={id:string;email:string;role:string;permissions:string[];expires_at:string;revoked_at:string|null;accepted_at:string|null};
const labels:Record<string,string>={owner:'Proprietário',admin:'Administrador legado',staff:'Atendente legado',manager:'Gerente',cashier:'Caixa',waiter:'Garçom',kitchen:'Cozinha'};
const roles:StaffRole[]=['manager','cashier','waiter','kitchen'];
const descriptions:Record<StaffRole,string>={
 manager:'Pedidos, atendimento, cozinha e caixa. Relatórios e administração são opcionais.',
 cashier:'Pedidos, comandas, pagamentos, abertura e fechamento do caixa.',
 waiter:'Mesas, comandas, pedidos e entrega dos pratos. Sem relatórios financeiros ou administração.',
 kitchen:'Itens da cozinha, início do preparo e conclusão. Sem acesso a pagamentos.'
};
function RoleFields({role,setRole,permissions,setPermissions}:{role:string;setRole:(role:string)=>void;permissions:string[];setPermissions:(p:string[])=>void}){
 return <><label>Perfil<select value={role} onChange={e=>{setRole(e.target.value);if(e.target.value!=='manager')setPermissions([]);}}>
 {!roles.includes(role as StaffRole)&&<option value={role} disabled>{labels[role]||role} — escolha o novo perfil</option>}
 {roles.map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label>
 {descriptions[role as StaffRole]&&<p className="muted">{descriptions[role as StaffRole]}</p>}
 {role==='manager'&&<fieldset style={{border:'1px solid var(--line)',borderRadius:10,padding:14}}>
 <legend>Permissões adicionais do gerente</legend>
 {([['reports','Relatórios financeiros completos'],['manage','Cardápio, estoque e administração operacional']] as const).map(([value,label])=><label key={value} style={{display:'block',marginBottom:10}}><input type="checkbox" checked={permissions.includes(value)} onChange={e=>setPermissions(e.target.checked?[...permissions,value]:permissions.filter(p=>p!==value))}/>{label}</label>)}
 <small>Somente o proprietário gerencia funcionários e a assinatura.</small></fieldset>}</>;
}
function MemberCard({member,onSaved}:{member:Member;onSaved:()=>Promise<void>}){
 const [role,setRole]=useState(member.role),[permissions,setPermissions]=useState(member.permissions),[active,setActive]=useState(!member.revoked_at),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const {confirmAction}=useInteraction();
 useEffect(()=>{setRole(member.role);setPermissions(member.permissions);setActive(!member.revoked_at);},[member]);
 async function save(e:FormEvent){
  e.preventDefault();if(busy)return;
  if(!active&&!member.revoked_at&&!await confirmAction(`Desativar o acesso de ${member.name}? As sessões serão encerradas e o histórico permanecerá salvo.`))return;
  setBusy(true);setError('');
  try{
   const response=await apiFetch('/api/staff',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:member.user_id,role,permissions,active})});
   const data=await response.json();if(!response.ok)throw Error(data.error);
   await onSaved();
  }catch(error){setError(error instanceof Error?error.message:'Não foi possível salvar.');}finally{setBusy(false);}
 }
 return <article className="panel" style={{marginTop:16}}>
 <h3>{member.name}</h3><p style={{overflowWrap:'anywhere'}}>{member.email}</p>
 {member.role==='owner'?<p>Proprietário · acesso completo</p>:<form onSubmit={save} className="form-stack">
 <fieldset disabled={busy} style={{border:0,padding:0,margin:0}}>
 <RoleFields role={role} setRole={setRole} permissions={permissions} setPermissions={setPermissions}/>
 <label style={{display:'block',marginTop:18}}><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Acesso ativo</label>
 <div className="form-actions"><button className="button-primary" disabled={busy||!roles.includes(role as StaffRole)}>{busy?'Salvando…':'Salvar acesso'}</button><span>{member.revoked_at?'Acesso desativado':'Acesso ativo'}</span></div>
 </fieldset>{error&&<Notice error>{error}</Notice>}</form>}
 </article>;
}
export default function StaffPage(){
 const {organizationId,organization}=useOrganization();
 const [members,setMembers]=useState<Member[]>([]),[invitations,setInvitations]=useState<Invitation[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [email,setEmail]=useState(''),[role,setRole]=useState<string>('waiter'),[permissions,setPermissions]=useState<string[]>([]),[busy,setBusy]=useState(false),[link,setLink]=useState('');
 const {confirmAction}=useInteraction();
 const load=useCallback(async()=>{
  const response=await apiFetch('/api/staff'),data=await response.json();
  if(!response.ok)throw Error(data.error);
  setMembers(data.members);setInvitations(data.invitations);setLoading(false);
 },[]);
 useEffect(()=>{if(!organizationId)return;void load().catch(error=>{setError(error.message);setLoading(false);});},[organizationId,load]);
 async function invite(e:FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');setLink('');
  try{
   const response=await apiFetch('/api/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,role,permissions})});
   const data=await response.json();if(!response.ok)throw Error(data.error);
   setLink(data.invitationUrl);setEmail('');await load();setMessage('Convite criado. Copie o link e envie diretamente ao funcionário.');
  }catch(error){setError(error instanceof Error?error.message:'Não foi possível criar o convite.');}finally{setBusy(false);}
 }
 async function revoke(id:string){
  if(!await confirmAction('Revogar este convite? O link deixará de permitir o acesso.'))return;
  setBusy(true);setError('');
  try{const response=await apiFetch('/api/staff',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({invitationId:id})});const data=await response.json();if(!response.ok)throw Error(data.error);setLink('');await load();setMessage('Convite revogado.');}
  catch(error){setError(error instanceof Error?error.message:'Não foi possível revogar.');}finally{setBusy(false);}
 }
 if(organization?.role!=='owner')return <main><PageHeader title="Funcionários" description="Acesso individual à operação."/><Notice error>Somente o proprietário pode gerenciar a equipe.</Notice></main>;
 return <main><PageHeader title="Funcionários" description="Cada funcionário entra com sua própria conta no mesmo estabelecimento. Você define o perfil e pode revogar o acesso."/>
 {error&&<Notice error>{error}</Notice>}{message&&<Notice>{message}</Notice>}
 <Panel title="Convidar funcionário"><form onSubmit={invite} className="form-stack"><fieldset disabled={busy} style={{border:0,padding:0,margin:0}}>
 <label>E-mail do funcionário<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <RoleFields role={role} setRole={setRole} permissions={permissions} setPermissions={setPermissions}/>
 <div className="form-actions"><button className="button-primary">{busy?'Aguarde…':'Criar convite'}</button></div></fieldset></form>
 <p className="muted">O link vale por sete dias e deve ser aceito com o e-mail informado. Um novo convite para o mesmo e-mail invalida o anterior. Nenhum e-mail é enviado automaticamente.</p>
 {link&&<div><label>Link do convite<input readOnly value={link} onFocus={e=>e.target.select()}/></label><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(link);setMessage('Link copiado. Envie-o somente ao funcionário convidado.');}catch{setMessage('Selecione o campo acima para copiar o link.');}}}>Copiar link</button></div>}</Panel>
 <section aria-labelledby="staff-members-title" style={{marginTop:28}}><h2 id="staff-members-title">Equipe</h2>
 {loading?<p role="status">Carregando funcionários…</p>:members.map(member=><MemberCard key={member.user_id} member={member} onSaved={async()=>{await load();setMessage('Acesso do funcionário atualizado.');}}/>)}</section>
 <section aria-labelledby="staff-invitations-title" style={{marginTop:28}}><h2 id="staff-invitations-title">Convites recentes</h2>
 {!invitations.length?<p>Nenhum convite criado.</p>:<div className="table-scroll"><table><thead><tr><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{invitations.map(invite=>{
  const expired=new Date(invite.expires_at).getTime()<=Date.now(),status=invite.accepted_at?'Aceito':invite.revoked_at?'Revogado':expired?'Expirado':'Pendente';
  return <tr key={invite.id}><td>{invite.email}</td><td>{labels[invite.role]}</td><td>{status}{status==='Pendente'&&<small style={{display:'block'}}>Até {new Date(invite.expires_at).toLocaleDateString('pt-BR')}</small>}</td><td>{status==='Pendente'&&<button disabled={busy} onClick={()=>void revoke(invite.id)}>Revogar</button>}</td></tr>;
 })}</tbody></table></div>}</section></main>;
}
