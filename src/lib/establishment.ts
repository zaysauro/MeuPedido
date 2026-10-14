import 'server-only';
import {getDb} from './db';
export async function accountEstablishment(userId:string){
 const sql=getDb();
 const rows=await sql`SELECT o.id,o.name,o.slug,m.role,o.id=authorized_establishment(${userId}) AS authorized FROM organization_members m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=${userId} ORDER BY o.created_at,o.id`;
 const organization=rows.find(row=>row.authorized===true);
 return {organization,regularizationRequired:rows.length>0&&!organization,organizations:rows};
}
