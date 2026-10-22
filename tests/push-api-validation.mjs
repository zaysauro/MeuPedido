import assert from 'node:assert/strict';
import {createECDH,createHash,randomBytes,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import webPush from 'web-push';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4320';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Only the isolated local application is allowed.');
assert.match(process.env.DATABASE_URL||'',/ep-gentle-butterfly-b4ykgpu9/,'Only the known isolated Neon branch is allowed.');
assert.ok(process.env.CRON_SECRET?.length>=32,'Local worker secret required.');
const suffix=randomUUID();let checks=0;
async function api(path,user,body,method=body?'POST':'GET',origin=base){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(user?{Cookie:user.cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,data:await response.json().catch(()=>({})),cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
}
function status(result,expected,label){assert.equal(result.status,expected,label+': '+JSON.stringify(result.data));checks++;return result.data;}
async function account(label){
 const email=`push-${suffix}-${label}@example.test`,password=randomUUID()+'Aa1!';
 const signup=await api('/api/auth/sign-up/email',null,{name:'Push isolated '+label,email,password});status(signup,200,'Individual test account');
 const signin=await api('/api/auth/sign-in/email',null,{email,password});status(signin,200,'Login');
 return {id:signup.data.user.id,email,cookie:signin.cookie};
}
const owner=await account('owner'),other=await account('other');
const org=status(await api('/api/organizations/create',owner,{name:'Push validation '+suffix}),201,'Test establishment').organization.id;
const otherOrg=status(await api('/api/organizations/create',other,{name:'Other push validation '+suffix}),201,'Other establishment').organization.id;
status(await api('/api/push/subscriptions'),401,'Anonymous rejected');
const configuration=status(await api('/api/push/subscriptions',owner),200,'Push configuration');
assert.equal(configuration.configured,true,'Local VAPID configuration must be active.');
assert.equal(configuration.publicKey,process.env.VAPID_PUBLIC_KEY);assert.ok(!('privateKey' in configuration));checks++;
const browserKey=createECDH('prime256v1');browserKey.generateKeys();
const subscription={endpoint:`https://fcm.googleapis.com/fcm/send/meupedido-isolated-${suffix}`,keys:{p256dh:browserKey.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
// Real VAPID signature and aes128gcm encryption; endpoint is an isolated synthetic fixture, not a browser subscription.
const request=webPush.generateRequestDetails(subscription,JSON.stringify({title:'Validation'}),{vapidDetails:{publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY,subject:process.env.VAPID_SUBJECT},TTL:120});
assert.ok(Buffer.isBuffer(request.body)&&request.body.length>0);assert.equal(request.headers['Content-Encoding'],'aes128gcm');checks++;
const activate={consent:true,subscription};
status(await api('/api/push/subscriptions',owner,activate,'POST','https://attacker.invalid'),403,'CSRF origin rejected');
status(await api('/api/push/subscriptions',owner,{...activate,organizationId:otherOrg}),403,'Cross-establishment registration rejected');
status(await api('/api/push/subscriptions',owner,{...activate,consent:false}),400,'Consent required');
status(await api('/api/push/subscriptions',owner,{...activate,subscription:{...subscription,endpoint:'https://127.0.0.1/secrets'}}),400,'SSRF rejected');
try{
 const first=status(await api('/api/push/subscriptions',owner,{...activate,userId:other.id,role:'owner'}),201,'Register with authenticated identity');
 const again=status(await api('/api/push/subscriptions',owner,activate),201,'Idempotent registration');assert.equal(again.id,first.id);checks++;
 const devices=status(await api('/api/push/subscriptions',owner),200,'Current device visible').devices;
 assert.ok(devices.some(d=>d.endpointHash===createHash('sha256').update(subscription.endpoint).digest('hex')));assert.ok(!JSON.stringify(devices).includes(subscription.endpoint));checks++;
 assert.equal(status(await api('/api/push/subscriptions',other),200,'Other establishment devices').devices.length,0);checks++;
 status(await api('/api/push/subscriptions',other,{endpoint:subscription.endpoint},'DELETE'),200,'Foreign delete is a no-op');
 assert.equal(status(await api('/api/push/subscriptions',owner),200,'Original device preserved').devices.length,1);checks++;
 status(await api('/api/push/subscriptions',owner,{endpoint:subscription.endpoint},'DELETE'),200,'Deactivate current device');
 assert.equal(status(await api('/api/push/subscriptions',owner),200,'No devices after deactivation').devices.length,0);checks++;
}finally{await api('/api/push/subscriptions',owner,{endpoint:subscription.endpoint},'DELETE');}
status(await api('/api/auth/sign-out',owner,{}),200,'Logout');
status(await api('/api/push/subscriptions',owner),401,'Expired/revoked session rejected');
const workerUnauthorized=await fetch(base+'/api/internal/push-dispatch');assert.equal(workerUnauthorized.status,401);checks++;
const worker=await fetch(base+'/api/internal/push-dispatch',{method:'POST',headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}});assert.equal(worker.status,200);const workerResult=await worker.json();assert.equal(workerResult.configured,true);checks++;
const manifest=await fetch(base+'/manifest.webmanifest');assert.equal(manifest.status,200);const manifestData=await manifest.json();assert.equal(manifestData.display,'standalone');assert.equal(manifestData.icons.length,3);checks++;
for(const path of ['/sw.js','/offline.html','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png']){const response=await fetch(base+path);assert.equal(response.status,200,path);checks++;}
const result={checkedAt:new Date().toISOString(),checks,environment:'isolated-local-neon',vapidSignatureAndEncryption:'passed',httpPushApis:'passed',workerAuthenticationAndDispatch:'passed',pwaHttpAssets:'passed',browserInstallation:'not-tested',realProviderDelivery:'not-tested',scheduledWorker:'not-provisioned'};
await writeFile('.validation-push-result.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log('PASS isolated push HTTP: '+checks+' checks; real VAPID signature/encryption, APIs, tenant isolation, deactivation, expired session, worker auth and PWA assets. Browser installation/provider delivery remain untested.');
