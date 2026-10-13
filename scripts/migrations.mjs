import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export async function migrations() {
 const dir=new URL('../database/neon/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>/^\d{3}_.*\.sql$/.test(n)&&!n.startsWith('003_')).sort();
 return Promise.all(names.map(async name=>{const source=await readFile(new URL(name,dir),'utf8');return {name,checksum:createHash('sha256').update(source).digest('hex'),sql:source.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')};}));
}
export async function migrate(db, { bootstrap=false, log=console.log }={}) {
 await db.query("SET search_path TO public");
 await db.query("SELECT pg_advisory_lock(71482022)");
 try {
  await db.query(`CREATE TABLE IF NOT EXISTS meupedido_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
  if(!bootstrap){for(const name of ['user','organizations','organization_members','restaurant_menu_items','restaurant_ingredients','restaurant_recipes']){const r=await db.query('SELECT to_regclass($1) AS object',[`public.${name}`]);if(!r.rows[0].object)throw Error(`Base ausente: ${name}. Use bootstrap somente em um banco de teste vazio.`);}}
  for(const m of await migrations()){
   if(!bootstrap && Number(m.name.slice(0,3))<4)continue;
   const old=await db.query('SELECT checksum FROM meupedido_schema_migrations WHERE name=$1',[m.name]);
   if(old.rows.length){if(old.rows[0].checksum!==m.checksum)throw Error(`Checksum divergente: ${m.name}`);continue;}
   await db.query('BEGIN');
   try{await db.exec(m.sql);await db.query('INSERT INTO meupedido_schema_migrations(name,checksum) VALUES($1,$2)',[m.name,m.checksum]);await db.query('COMMIT');log(`Aplicada: ${m.name}`);}catch(e){await db.query('ROLLBACK');throw Error(`Falha em ${m.name}: ${e.message}`);}
  }
 } finally {await db.query('SELECT pg_advisory_unlock(71482022)');}
}
