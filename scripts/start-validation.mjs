import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','4320'],{stdio:'inherit',env:{...process.env,DATABASE_URL:process.env.MIGRATION_DATABASE_URL,BETTER_AUTH_SECRET:randomBytes(48).toString('hex'),BETTER_AUTH_URL:'http://127.0.0.1:4320',NEXT_TELEMETRY_DISABLED:'1'}});
process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',code=>process.exit(code??1));
