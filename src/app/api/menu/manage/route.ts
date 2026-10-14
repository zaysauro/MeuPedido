import {withOrganizationAccess} from '@/lib/organization-access';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad=(error:string,status=400)=>NextResponse.json({error},{status});
async function handlePOST(req:Request) {
 try {
  const session=await createAuth().api.getSession({headers:await headers()});
  if(!session)return bad('unauthorized',401);
  const raw:unknown=await req.json();
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return bad('invalid_body');
  const b=raw as Record<string,unknown>;
  if(typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||!['create','update','delete'].includes(String(b.action)))return bad('invalid_fields');
  const org=b.organizationId;
  const sql=getDb();
  const role=await sql`SELECT role FROM organization_members WHERE organization_id=${org}::uuid AND user_id=${session.user.id}`;
  if(!role.length||!['owner','admin'].includes(String(role[0].role)))return bad('forbidden',403);
  if(b.action==='delete') {
   if(typeof b.itemId!=='string'||!uuid.test(b.itemId))return bad('invalid_item');
   const used=await sql`SELECT 1 FROM restaurant_order_items WHERE organization_id=${org}::uuid AND menu_item_id=${b.itemId}::uuid LIMIT 1`;
   if(used.length)return bad('item_has_orders_disable_instead',409);
   const removed=await sql`DELETE FROM restaurant_menu_items WHERE id=${b.itemId}::uuid AND organization_id=${org}::uuid RETURNING id`;
   return removed.length?NextResponse.json({id:removed[0].id}):bad('not_found',404);
  }
  const name=typeof b.name==='string'?b.name.trim():'';
  const description=typeof b.description==='string'?b.description.trim():'';
  const price=b.priceCents;
  const image=typeof b.imageUrl==='string'?b.imageUrl.trim():'';
  if(name.length<1||name.length>160||description.length>2000||!Number.isSafeInteger(price)||Number(price)<0||Number(price)>1000000000||image.length>2048||typeof b.available!=='boolean')return bad('invalid_product');
  if(image){try{const u=new URL(image);if(u.protocol!=='https:')return bad('invalid_image_url')}catch{return bad('invalid_image_url')}}
  const category=b.categoryId===null||b.categoryId===''?null:b.categoryId;
  if(category!==null&&(typeof category!=='string'||!uuid.test(category)))return bad('invalid_category');
  if(category!==null){
   const valid=await sql`SELECT 1 FROM restaurant_categories WHERE id=${category}::uuid AND organization_id=${org}::uuid`;
   if(!valid.length)return bad('invalid_category');
  }
  if(b.action==='create'){
   const rows=await sql`INSERT INTO restaurant_menu_items(organization_id,category_id,name,description,price_cents,image_url,available)
    VALUES(${org}::uuid,${category}::uuid,${name},${description},${price as number},${image||null},${b.available as boolean})
    RETURNING id,name,price_cents,available`;
   return NextResponse.json({item:rows[0]},{status:201});
  }
  if(typeof b.itemId!=='string'||!uuid.test(b.itemId))return bad('invalid_item');
  const rows=await sql`UPDATE restaurant_menu_items SET category_id=${category}::uuid,name=${name},description=${description},
    price_cents=${price as number},image_url=${image||null},available=${b.available as boolean},updated_at=now()
    WHERE id=${b.itemId}::uuid AND organization_id=${org}::uuid RETURNING id,name,price_cents,available`;
  return rows.length?NextResponse.json({item:rows[0]}):bad('not_found',404);
 }catch{return bad('operation_failed',503)}
}

export const POST = withOrganizationAccess(handlePOST);
