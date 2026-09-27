// Prepare migration secrets without printing values. Files are gitignored.
const fs=require('node:fs'),crypto=require('node:crypto');
const env={};for(const line of fs.readFileSync('.env','utf8').split(/\r?\n/)){
 const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(!m)continue;
 let value=m[2].trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);env[m[1]]=value;
}
const keys=['TZ','GATEWAY_SHARED_SECRET','GATEWAY_SESSION_SECRET','HUB_ADMIN_USER','HUB_ADMIN_PASSWORD_HASH','HUB_EDITOR_PASSWORD_HASH','NODERED_CREDENTIAL_SECRET'];
const target={};for(const key of keys){if(!env[key])throw Error('Missing '+key);target[key]=env[key];}
target.POSTGRES_USER='falcon_central';target.POSTGRES_DB='falcon_central';target.POSTGRES_PASSWORD=crypto.randomBytes(32).toString('hex');
const encode=obj=>Object.entries(obj).map(([k,v])=>k+"='"+v.replace(/'/g,"\\'")+"'").join('\n')+'\n';
if(fs.existsSync('.deployment/cloud.env'))throw Error('Cloud secrets already prepared; do not replace');
fs.writeFileSync('.deployment/cloud.env',encode(target));fs.writeFileSync('.deployment/tunnel.env',encode({TUNNEL_TOKEN:env.CLOUDFLARE_TUNNEL_TOKEN}));
const publicKey=fs.readFileSync('.deployment/id_ed25519.pub','utf8').trim();
fs.writeFileSync('.deployment/authorized-line','restrict,port-forwarding,permitlisten="127.0.0.1:18880",permitlisten="127.0.0.1:18882",permitopen="127.0.0.1:18881",command="/bin/false" '+publicKey+'\n');
console.log('Prepared private cloud environment and restricted public key.');
