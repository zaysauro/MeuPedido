import pg from 'pg';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const client=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});await client.connect();
const file=new URL('../../production-preservation.json',import.meta.url);
const quote=s=>'"'+s.replaceAll('"','""')+'"';
try{
 let baseline;
 if(process.argv.includes('--before')){
  const tables=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows;
  baseline=[];
  for(const{table_name:table}of tables){const columns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>r.column_name);baseline.push({table,columns});}
 }else baseline=JSON.parse(await readFile(file,'utf8'));
 for(const entry of baseline){const rows=(await client.query(`SELECT md5(row_to_json(t)::text) AS hash FROM (SELECT ${entry.columns.map(quote).join(',')} FROM public.${quote(entry.table)}) t ORDER BY hash`)).rows.map(r=>r.hash);if(process.argv.includes('--before'))entry.hashes=rows;else if(entry.table==='meupedido_schema_migrations'){for(const hash of entry.hashes)assert.ok(rows.includes(hash),'Registro de migração anterior alterado');}else assert.deepEqual(rows,entry.hashes,'Dados existentes alterados: '+entry.table);console.log(entry.table+': '+rows.length+' registros '+(process.argv.includes('--before')?'registrados':'preservados'));}
 if(process.argv.includes('--before'))await writeFile(file,JSON.stringify(baseline),{mode:0o600});
}finally{await client.end();}
