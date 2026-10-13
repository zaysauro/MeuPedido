'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {parseBRL} from '@/lib/money';
import { authClient } from '@/lib/auth-client';
type Org = {id:string;name:string};
type Session = {id:string;opened_at:string;closed_at:string|null;opening_cents:number;counted_cents:number|null;net_movements_cents:number;cash_sales_cents:number};
const money=(n:number)=>((n||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function Caixa() {
 const [methods,setMethods]=useState<{cash_session_id:string;method:string;amount_cents:string}[]>([]),[movements,setMovements]=useState<{id:string;kind:string;amount_cents:number;notes:string;created_at:string}[]>([]);
 const {data:session,isPending}=authClient.useSession();
 const [orgs,setOrgs]=useState<Org[]>([]),[org,setOrg]=useState('');
 const [sessions,setSessions]=useState<Session[]>([]),[action,setAction]=useState('open'),[kind,setKind]=useState('suprimento');
 const [amount,setAmount]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const active=sessions.find(s=>!s.closed_at);
 useEffect(()=>{if(!session)return;fetch('/api/organizations').then(r=>r.json()).then(d=>{setOrgs(d.organizations||[]);setOrg(d.organizations?.find((o:Org)=>o.id===new URLSearchParams(window.location.search).get('organizationId'))?.id||d.organizations?.[0]?.id||'')}).catch(()=>setMessage('Falha ao carregar estabelecimentos.'))},[session]);
 async function refresh(){if(!org)return;try{const r=await fetch('/api/restaurant/cash?organizationId='+encodeURIComponent(org),{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();setSessions(d.sessions||[]);setMethods(d.methods||[]);setMovements(d.movements||[])}catch{setMessage('Não foi possível consultar o caixa. Tente atualizar a página ou fale com o suporte.')}}
 useEffect(()=>{setSessions([]);setAction('open');void refresh()},[org]);
 async function submit(e:FormEvent){e.preventDefault();const cents=parseBRL(amount);if(cents===null){setMessage('Valor inválido.');return}if(action==='close'&&!confirm('Confirmar fechamento do caixa com o valor contado?'))return;setBusy(true);setMessage('');
 try{const r=await fetch('/api/restaurant/cash',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:org,sessionId:active?.id,action:active?(action==='close'?'close':'move'):'open',kind,amountCents:cents,notes})});if(!r.ok)throw Error();setAmount('');setNotes('');setMessage('Operação registrada.');await refresh()}catch{setMessage('Operação recusada. Verifique o estado do caixa e suas permissões.')}finally{setBusy(false)}}
 if(isPending)return <main style={{padding:24}}>Carregando...</main>;
 if(!session)return <main style={{padding:24}}><a href="/login">Entrar</a></main>;
 return <main style={{maxWidth:960,margin:'30px auto',padding:24,color:'#173d2d'}}><a href="/painel">← Painel</a><h1>Controle de caixa</h1>
 <label>Estabelecimento <select value={org} onChange={e=>setOrg(e.target.value)}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
 <section style={{marginTop:24,padding:20,border:'1px solid #c9ded2',borderRadius:12}}>
 <h2>{active?'Caixa aberto':'Caixa fechado'}</h2>
 {active&&<><p>Aberto em {new Date(active.opened_at).toLocaleString('pt-BR')}</p><p>Fundo inicial: {money(active.opening_cents)}</p><p>Suprimentos e sangrias (líquido): {money(Number(active.net_movements_cents))}</p><p>Vendas em dinheiro: {money(Number(active.cash_sales_cents))}</p><p>Esperado no caixa: {money(Number(active.opening_cents)+Number(active.net_movements_cents)+Number(active.cash_sales_cents))}</p></>}
 <form onSubmit={submit} style={{display:'grid',gap:12,maxWidth:400}}>
 {active?<label>Operação <select value={action==='open'?'move':action} onChange={e=>setAction(e.target.value)}><option value="move">Movimentar</option><option value="close">Fechar caixa</option></select></label>:<p>Informe o valor inicial para abrir um novo turno.</p>}
 {active&&action!=='close'&&<label>Tipo<select value={kind} onChange={e=>setKind(e.target.value)}><option value="suprimento">Suprimento</option><option value="sangria">Sangria</option></select></label>}
 <label>{active&&action==='close'?'Valor contado em dinheiro (R$)':'Valor (R$)'}<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00" style={{display:'block',padding:10,width:'100%'}}/></label>
 {active&&action!=='close'&&<label>Motivo<textarea maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} style={{display:'block',padding:10,width:'100%'}}/></label>}
 <button disabled={busy||!org} style={{background:'#17663c',color:'white',border:0,padding:14,borderRadius:8}}>{busy?'Salvando...':!active?'Abrir caixa':action==='close'?'Confirmar fechamento':'Registrar movimentação'}</button>
 </form></section>
 <h2>Pagamentos por forma no turno atual</h2>{methods.filter(m=>m.cash_session_id===active?.id).map(m=><p key={m.method}>{m.method}: {money(Number(m.amount_cents))}</p>)}<h2>Movimentações recentes</h2>{movements.map(m=><p key={m.id}>{new Date(m.created_at).toLocaleString('pt-BR')} · {m.kind} · {money(m.amount_cents)} · {m.notes}</p>)}<h2>Turnos recentes</h2>{sessions.map(s=><article key={s.id} style={{padding:12,borderBottom:'1px solid #ddd'}}><strong>{s.closed_at?'Fechado':'Aberto'}</strong> · {new Date(s.opened_at).toLocaleString('pt-BR')} · Fundo: {money(s.opening_cents)}{s.closed_at&&<span> · Contagem: {money(Number(s.counted_cents))} · Diferença: {money(Number(s.counted_cents)-Number(s.opening_cents)-Number(s.net_movements_cents)-Number(s.cash_sales_cents))}</span>}</article>)}
 <p style={{fontSize:13}}>Conferência estimada: fundo inicial + suprimentos - sangrias + pagamentos em dinheiro vinculados ao turno.</p>
 {message&&<p role="status">{message}</p>}</main>;
}
