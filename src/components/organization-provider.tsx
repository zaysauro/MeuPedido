'use client';
import {createContext,useContext,useEffect,useState,useCallback,useRef} from 'react';
import {usePathname,useRouter} from 'next/navigation';
export type Organization={id:string;name:string;slug?:string;role:string};
type Context={organizations:Organization[];organizationId:string;organization:Organization|undefined;setOrganizationId:(id:string)=>void;refreshOrganizations:(preferred?:string)=>Promise<void>;revision:number};
const OrganizationContext=createContext<Context|null>(null);
export function useOrganization(){const value=useContext(OrganizationContext);if(!value)throw Error('OrganizationProvider required');return value;}
export function OrganizationProvider({children,userId}:{children:React.ReactNode;userId:string}){
 const [organizations,setOrganizations]=useState<Organization[]>([]),[organizationId,setId]=useState(''),[ready,setReady]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const path=usePathname(),router=useRouter(),current=useRef('');const storageKey='meupedido.organization.'+userId;
 const refreshOrganizations=useCallback(async(preferred?:string)=>{try{const r=await fetch('/api/organizations',{cache:'no-store'});if(!r.ok)throw Error();const list:Organization[]=(await r.json()).organizations;setOrganizations(list);const query=new URLSearchParams(window.location.search).get('organizationId');const saved=localStorage.getItem(storageKey);const wanted=preferred||current.current||query||saved;const id=list.find(o=>o.id===wanted)?.id||list[0]?.id||'';current.current=id;setId(id);if(id)localStorage.setItem(storageKey,id);setError('');setReady(true);}catch{setError('Não foi possível carregar seus estabelecimentos.');}},[storageKey]);
 useEffect(()=>{void refreshOrganizations();},[refreshOrganizations]);
 useEffect(()=>{const requested=new URLSearchParams(window.location.search).get('organizationId');if(requested&&organizations.some(o=>o.id===requested)){current.current=requested;setId(requested);localStorage.setItem(storageKey,requested);}},[path,organizations,storageKey]);
 const setOrganizationId=(id:string)=>{if(!organizations.some(o=>o.id===id))return;current.current=id;setId(id);localStorage.setItem(storageKey,id);router.replace(path);};
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>setRevision(n=>n+1),150);};const visible=()=>{if(document.visibilityState==='visible')refresh();};window.addEventListener('meupedido:changed',refresh);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);const interval=setInterval(visible,20000);const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('meupedido-data'):null;if(channel)channel.onmessage=refresh;return()=>{clearTimeout(timer);clearInterval(interval);window.removeEventListener('meupedido:changed',refresh);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);channel?.close();};},[]);
 if(!ready)return <main className="session-loading"><h1>MeuPedido</h1>{error?<><p role="alert">{error}</p><button onClick={()=>void refreshOrganizations()}>Tentar novamente</button></>:<p role="status">Carregando seu estabelecimento…</p>}</main>;
 return <OrganizationContext.Provider value={{organizations,organizationId,organization:organizations.find(o=>o.id===organizationId),setOrganizationId,refreshOrganizations,revision}}>{children}</OrganizationContext.Provider>;
}
