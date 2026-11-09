import {readFile,writeFile,mkdir,realpath,stat,rename,chmod} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {onlineReviewConfig} from '../services/transfer-online-nginx.js';
if(process.platform!=='linux'||process.getuid?.()!==0)throw new Error('Run as root on Timeweb');
const health=await fetch('http://127.0.0.1:4004/api/health',{signal:AbortSignal.timeout(5000)});
if(!health.ok||!(await health.json()).source?.hybridPreview)throw new Error('Separate review service is not ready');
const feed=await fetch('http://127.0.0.1:4004/api/transfer/feed-status',{signal:AbortSignal.timeout(60000)});
if(!feed.ok)throw new Error('Review quotes unavailable; no config changes');
const path=await realpath('/etc/nginx/sites-enabled/terminal2');
if(!path.startsWith('/etc/nginx/sites-available/')&&!path.startsWith('/etc/nginx/sites-enabled/'))throw new Error('Unexpected nginx target');
const original=await readFile(path,'utf8'),updated=onlineReviewConfig(original),mode=(await stat(path)).mode&0o777;
const directory='/root/mt5-backups/online-domain-'+new Date().toISOString().replace(/[-:.TZ]/g,'');
await mkdir(directory,{mode:0o700});await writeFile(directory+'/terminal2.conf',original,{mode:0o600,flag:'wx'});
async function replace(value){const temp=path+'.transfer-review.tmp';await writeFile(temp,value,{mode,flag:'wx'});await chmod(temp,mode);await rename(temp,path);}
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw new Error(command+' failed '+result.status);}
await replace(updated);
try{run('nginx',['-t']);run('systemctl',['reload','nginx']);}
catch(error){await replace(original);run('nginx',['-t']);run('systemctl',['reload','nginx']);throw new Error('Original config restored: '+error.message);}
console.log('NGINX_BACKUP='+directory+'/terminal2.conf');
console.log('ONLINE_DOMAIN_CONNECTED — https://trader-mt5.online/mobile/login ; https://trader-mt5.online/pc/login.html ; read-only transfer review');
