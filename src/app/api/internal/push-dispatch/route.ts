import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {dispatchPushNotifications} from '@/lib/push';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
async function dispatch(request:Request){
 const secret=process.env.CRON_SECRET;
 const authorization=request.headers.get('authorization')||'';
 if(!secret||secret.length<32)return NextResponse.json({error:'Worker não configurado.'},{status:503});
 const actual=Buffer.from(authorization),expected=Buffer.from(`Bearer ${secret}`);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return NextResponse.json({error:'Não autorizado.'},{status:401});
 try{return NextResponse.json(await dispatchPushNotifications(40),{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Falha temporária. As entregas pendentes serão tentadas novamente.'},{status:503});}
}
export const GET=dispatch;
export const POST=dispatch;
