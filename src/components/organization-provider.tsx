'use client';
import {OperationalLive} from './operational-live';
import {createContext,useContext,useEffect,useState,useCallback} from 'react';
import {usePathname,useRouter} from 'next/navigation';
export type Organization={id:string;name:string;slug?:string;role:string;permissions?:string[]};
type Context={organizations:Organization[];organizationId:string;organization:Organization|undefined;regularizationRequired:boolean;legacyOrganizations:Organization[];refreshOrganizations:()=>Promise<void>;revision:number};
const OrganizationContext=createContext<Context|null>(null);
export function useOrganization(){const value=useContext(OrganizationContext);if(!value)throw Error('OrganizationProvider required');return value;}
export function OrganizationProvider({children,userId}:{children:React.ReactNode;userId:string}){
 const [organizations,setOrganizations]=useState<Organization[]>([]),[organizationId,setId]=useState(''),[ready,setReady]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const path=usePathname(),router=useRouter();
 const [regularizationRequired,setRegularization]=useState(false),[legacyOrganizations,setLegacy]=useState<Organization[]>([]);
 const refreshOrganizations=useCallback(async()=>{try{const r=await fetch('/api/organizations',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();setOrganizations(data.organizations);setId(data.organizations[0]?.id||'');setRegularization(Boolean(data.regularizationRequired));setLegacy(data.legacyOrganizations||[]);setError('');setReady(true);}catch{setError('Não foi possível carregar seu estabelecimento.');}},[]);
 useEffect(()=>{const expired=()=>{setOrganizations([]);setId('');router.replace('/login');};window.addEventListener('meupedido:session-expired',expired);return()=>window.removeEventListener('meupedido:session-expired',expired);},[router]);
 useEffect(()=>{localStorage.removeItem('meupedido.organization.'+userId);void refreshOrganizations();},[refreshOrganizations,userId]);
 useEffect(()=>{if(ready&&!regularizationRequired&&!organizationId&&path!=='/onboarding'&&path!=='/suporte')router.replace('/onboarding');if(ready&&organizationId&&path==='/onboarding')router.replace('/configuracoes');},[ready,organizationId,regularizationRequired,path,router]);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>setRevision(n=>n+1),150);};const visible=()=>{if(document.visibilityState==='visible')refresh();};window.addEventListener('meupedido:changed',refresh);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('meupedido-data'):null;if(channel)channel.onmessage=refresh;return()=>{clearTimeout(timer);window.removeEventListener('meupedido:changed',refresh);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);channel?.close();};},[]);
 if(!ready)return <main className="session-loading"><h1>MeuPedido</h1>{error?<><p role="alert">{error}</p><button onClick={()=>void refreshOrganizations()}>Tentar novamente</button></>:<p role="status">Carregando seu estabelecimento…</p>}</main>;
 return <OrganizationContext.Provider value={{organizations,organizationId,organization:organizations.find(o=>o.id===organizationId),regularizationRequired,legacyOrganizations,refreshOrganizations,revision}}>{organizationId&&<OperationalLive key={organizationId+userId} organizationId={organizationId} userId={userId}/>} {children}</OrganizationContext.Provider>;
}
