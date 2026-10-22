/** Run once from a scheduler. Keep CRON_SECRET and the deployment URL in its secret store. */
const target=process.env.PUSH_WORKER_URL;
const secret=process.env.CRON_SECRET;
if(!target||!secret||secret.length<32)throw new Error('Configure PUSH_WORKER_URL e CRON_SECRET no ambiente do worker.');
const url=new URL('/api/internal/push-dispatch',target);
if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('O worker exige HTTPS.');
const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(55000)});
if(!response.ok)throw new Error(`O worker respondeu HTTP ${response.status}; tente novamente no próximo ciclo.`);
const result=await response.json();
if(!result.configured)throw new Error('Web Push aguarda configuração VAPID.');
console.log(JSON.stringify({sent:result.sent,failed:result.failed}));
