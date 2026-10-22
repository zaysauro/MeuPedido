import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { privateHeaders, realtimeIdentity } from '@/lib/realtime';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:privateHeaders});
async function handle(request:Request){
 try{
  const identity=await realtimeIdentity(request);if(identity instanceof Response)return identity;
  const {organizationId:org,userId}=identity,sql=getDb();
  const permission=await sql`SELECT restaurant_has_permission(${org}::uuid,${userId},'prepare') OR restaurant_has_permission(${org}::uuid,${userId},'serve') AS allowed,EXISTS(SELECT 1 FROM organization_members WHERE organization_id=${org}::uuid AND user_id=${userId} AND role='owner' AND revoked_at IS NULL) AS owner`;
  if(!permission[0].allowed)return json({error:'Seu perfil não permite acessar impressões.'},403);
  if(request.method==='PATCH'){
   if(!permission[0].owner)return json({error:'Somente o proprietário configura a impressão.'},403);
   const b=await request.json().catch(()=>null);
   if(!b||Object.keys(b).some(k=>!['mode','printerName','paperWidth'].includes(k))||!['digital','print','hybrid'].includes(b.mode)||typeof b.printerName!=='string'||b.printerName.length>120||![58,80].includes(b.paperWidth)||(b.mode!=='digital'&&!b.printerName.trim()))return json({error:'Informe o modo, o nome da impressora e a largura do papel.'},400);
   const updated=await sql`INSERT INTO restaurant_print_settings(organization_id,mode,printer_name,paper_width) SELECT ${org}::uuid,${b.mode},${b.printerName.trim()},${b.paperWidth} WHERE EXISTS(SELECT 1 FROM organization_members WHERE organization_id=${org}::uuid AND user_id=${userId} AND role='owner' AND revoked_at IS NULL) ON CONFLICT(organization_id) DO UPDATE SET mode=EXCLUDED.mode,printer_name=EXCLUDED.printer_name,paper_width=EXCLUDED.paper_width,updated_at=now() RETURNING organization_id`;
   if(!updated.length)return json({error:'Acesso não permitido.'},403);
   return json({ok:true});
  }
  if(request.method==='POST'){
   const b=await request.json().catch(()=>null);
   if(b?.action==='enqueue'){
    if(Object.keys(b).some(k=>!['orderId','batchId','requestId','action'].includes(k))||!uuid.test(b.orderId||'')||!uuid.test(b.batchId||'')||!uuid.test(b.requestId||''))return json({error:'Lote inválido.'},400);
    const result=await sql`SELECT restaurant_print_manual(${org}::uuid,${userId},${b.orderId}::uuid,${b.batchId}::uuid,${b.requestId}::uuid) AS id`;
    return json({id:result[0].id},201);
   }
   if(!b||Object.keys(b).some(k=>!['jobId','requestId','action','details'].includes(k))||!uuid.test(b.jobId||'')||!uuid.test(b.requestId||'')||!['reprint','dialog_opened','confirmed','failed'].includes(b.action)||(b.details!==undefined&&(typeof b.details!=='string'||b.details.length>500)))return json({error:'Solicitação de impressão inválida.'},400);
   const result=b.action==='reprint'?await sql`SELECT restaurant_print_reissue(${org}::uuid,${userId},${b.jobId}::uuid,${b.requestId}::uuid) AS id`:await sql`SELECT restaurant_print_record(${org}::uuid,${userId},${b.jobId}::uuid,${b.requestId}::uuid,${b.action},${b.details||''}) AS id`;
   return json({id:result[0].id},201);
  }
  const params=new URL(request.url).searchParams,jobId=params.get('jobId'),orderId=params.get('orderId');
  if((jobId&&!uuid.test(jobId))||(orderId&&!uuid.test(orderId)))return json({error:'Impressão inválida.'},400);
  const settings=(await sql`SELECT mode,printer_name,paper_width FROM restaurant_print_settings WHERE organization_id=${org}::uuid`)[0]||{mode:'digital',printer_name:'',paper_width:80};
  if(jobId){
   const rows=await sql`SELECT id,order_id,batch_id,reprint_of,snapshot,status,created_at FROM restaurant_print_jobs WHERE organization_id=${org}::uuid AND id=${jobId}::uuid`;
   if(!rows.length)return json({error:'Impressão não encontrada.'},404);
   const attempts=await sql`SELECT action,details,created_at FROM restaurant_print_attempts WHERE organization_id=${org}::uuid AND job_id=${jobId}::uuid ORDER BY created_at DESC LIMIT 30`;
   return json({job:rows[0],settings,attempts,canConfigure:permission[0].owner});
  }
  const jobs=await sql`SELECT id,order_id,batch_id,reprint_of,status,created_at,snapshot->>'order_number' AS order_number,snapshot->>'table_label' AS table_label,snapshot->>'new_items' AS new_items FROM restaurant_print_jobs WHERE organization_id=${org}::uuid AND (${orderId}::uuid IS NULL OR order_id=${orderId}::uuid) ORDER BY created_at DESC LIMIT 100`;
  const batches=orderId?await sql`SELECT batch_id,min(created_at) AS created_at,count(*)::int AS item_count FROM restaurant_order_items WHERE organization_id=${org}::uuid AND order_id=${orderId}::uuid AND requires_preparation AND status<>'cancelado' GROUP BY batch_id ORDER BY min(created_at)`:[];
  return json({settings,jobs,batches,canConfigure:permission[0].owner});
 }catch(error){
  const code=error instanceof Error?error.message:'';
  if(/forbidden/.test(code))return json({error:'Seu acesso mudou. Entre novamente.'},403);
  if(/request_payload_mismatch|use_reprint|print_dialog_required/.test(code))return json({error:'A operação já mudou. Recarregue o histórico e use Reimprimir para uma nova cópia.'},409);
  return json({error:'Não foi possível registrar a impressão. A cozinha digital continua disponível.'},503);
 }
}
export const GET=handle;export const PATCH=handle;export const POST=handle;
