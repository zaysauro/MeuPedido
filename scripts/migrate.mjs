import pg from 'pg';
import { migrate } from './migrations.mjs';
const url=process.env.MIGRATION_DATABASE_URL;
if(!url)throw Error('Configure MIGRATION_DATABASE_URL com a branch de teste.');
const host=new URL(url).hostname;
if(process.env.MIGRATION_EXPECTED_HOST!==host)throw Error('MIGRATION_EXPECTED_HOST deve corresponder ao destino verificado no console Neon.');
if(process.argv.includes('--production') && (!process.env.MIGRATION_RECOVERY_POINT || process.env.MIGRATION_TESTS_PASSED!=='true'))throw Error('Produção exige MIGRATION_RECOVERY_POINT e MIGRATION_TESTS_PASSED=true após validação real.');
const client=new pg.Client({connectionString:url});
await client.connect();
try{await migrate({query:(...a)=>client.query(...a),exec:s=>client.query(s)},{bootstrap:process.argv.includes('--bootstrap')});}finally{await client.end();}
