'use client';
import {useEffect,useRef,useState} from 'react';

type InstallPrompt=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
type PushState={configured:boolean;publicKey:string;devices:Array<{endpointHash:string}>};
function publicKeyBuffer(value:string):ArrayBuffer{
  const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes.buffer;
}
async function subscriptionHash(endpoint:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function pushRequest(method:string,body?:unknown){
  const response=await fetch('/api/push/subscriptions',{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Não foi possível configurar notificações.');
  return data;
}

export default function PwaControls(){
  const [offline,setOffline]=useState(false),[supported,setSupported]=useState(false),[enabled,setEnabled]=useState(false);
  const [config,setConfig]=useState<PushState|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [install,setInstall]=useState<InstallPrompt|null>(null),[installed,setInstalled]=useState(false);
  const [waiting,setWaiting]=useState<ServiceWorker|null>(null),[registration,setRegistration]=useState<ServiceWorkerRegistration|null>(null);
  const reloadForUpdate=useRef(false);
  useEffect(()=>{
    let alive=true;
    const updateConnection=()=>setOffline(!navigator.onLine);
    const prompt=(event:Event)=>{event.preventDefault();setInstall(event as InstallPrompt);};
    const didInstall=()=>{setInstall(null);setInstalled(true);};
    const controllerChanged=()=>{if(reloadForUpdate.current)window.location.reload();};
    updateConnection();
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    const canPush=window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
    setSupported(canPush);
    window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);
    window.addEventListener('beforeinstallprompt',prompt);window.addEventListener('appinstalled',didInstall);
    if('serviceWorker' in navigator && window.isSecureContext){
      navigator.serviceWorker.addEventListener('controllerchange',controllerChanged);
      void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(async reg=>{
        if(!alive)return;
        setRegistration(reg);setWaiting(reg.waiting);
        reg.addEventListener('updatefound',()=>{
          const worker=reg.installing;
          worker?.addEventListener('statechange',()=>{
            if(alive&&worker.state==='installed'&&navigator.serviceWorker.controller)setWaiting(reg.waiting);
          });
        });
        if(canPush){
          const data:PushState=await pushRequest('GET');
          const subscription=await reg.pushManager.getSubscription();
          const hash=subscription?await subscriptionHash(subscription.endpoint):null;
          if(alive){setConfig(data);setEnabled(Boolean(hash&&data.devices.some(device=>device.endpointHash===hash)));}
        }
      }).catch(error=>{if(alive)setMessage(error instanceof Error?error.message:'O aplicativo não pôde verificar as notificações.');});
    }
    return ()=>{
      alive=false;
      window.removeEventListener('online',updateConnection);window.removeEventListener('offline',updateConnection);
      window.removeEventListener('beforeinstallprompt',prompt);window.removeEventListener('appinstalled',didInstall);
      navigator.serviceWorker?.removeEventListener('controllerchange',controllerChanged);
    };
  },[]);
  async function togglePush(){
    if(!registration||busy)return;
    setBusy(true);setMessage('');
    try{
      if(enabled){
        const subscription=await registration.pushManager.getSubscription();
        if(subscription){
          await subscription.unsubscribe();
          setEnabled(false);
          await pushRequest('DELETE',{endpoint:subscription.endpoint});
        }else setEnabled(false);
        setMessage('Notificações desativadas neste dispositivo.');
      }else{
        if(!config?.configured)throw new Error('Web Push ainda não foi configurado.');
        // This permission request runs directly in the click handler, as required by mobile browsers.
        const permission=await Notification.requestPermission();
        if(permission!=='granted')throw new Error('Notificações não autorizadas. Você pode continuar usando o MeuPedido normalmente.');
        const current=await registration.pushManager.getSubscription();
        const subscription=current||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKeyBuffer(config.publicKey)});
        try{
          await pushRequest('POST',{subscription:subscription.toJSON(),consent:true,deviceName:'Este dispositivo'});
        }catch(error){
          if(!current)await subscription.unsubscribe();
          throw error;
        }
        setEnabled(true);setMessage('Notificações ativadas neste dispositivo. A entrega depende do navegador e do sistema operacional.');
      }
    }catch(error){setMessage(error instanceof Error?error.message:'Não foi possível configurar notificações.');}
    finally{setBusy(false);}
  }
  return <div className="pwa-controls">
    {offline&&<p className="notice error" role="alert">Sem conexão. Pedidos e pagamentos exigem internet. Reconecte para recuperar o estado atual.</p>}
    {waiting&&<p className="notice" role="status">Há uma atualização do aplicativo. Conclua ou salve o que está fazendo antes de continuar.{' '}<button type="button" onClick={()=>{reloadForUpdate.current=true;waiting.postMessage({type:'ACTIVATE_UPDATE'});}}>Atualizar aplicativo</button></p>}
    <details>
      <summary>Aplicativo e notificações no celular</summary>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',paddingBlock:12}}>
        {install&&!installed&&<button type="button" onClick={async()=>{await install.prompt();await install.userChoice;setInstall(null);}}>Instalar MeuPedido</button>}
        {supported&&<button type="button" disabled={busy||offline||!registration||(!enabled&&!config?.configured)} onClick={()=>void togglePush()}>{busy?'Aguarde…':enabled?'Desativar notificações neste dispositivo':'Ativar notificações neste dispositivo'}</button>}
        {registration&&<button type="button" disabled={offline} onClick={()=>void registration.update().then(()=>setMessage('Verificação de atualização concluída.')).catch(()=>setMessage('Não foi possível verificar atualizações agora.'))}>Verificar atualização</button>}
      </div>
      {!installed&&!install&&<p>No iPhone ou iPad, use Compartilhar → Adicionar à Tela de Início. No Android, procure “Instalar aplicativo” no menu do navegador.</p>}
      {!supported&&<p>Notificações push não estão disponíveis neste navegador. No iPhone e iPad compatíveis, abra o MeuPedido pela Tela de Início.</p>}
      {supported&&config&&!config.configured&&<p>Web Push aguarda configuração do administrador. Os avisos dentro do sistema continuam disponíveis.</p>}
      {message&&<p role="status" className="notice">{message}</p>}
    </details>
  </div>;
}
