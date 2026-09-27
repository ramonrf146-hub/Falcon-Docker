const fs=require('node:fs');
const file='docker-compose.yml';let text=fs.readFileSync(file,'utf8');
fs.copyFileSync(file,'.deployment/docker-compose.before-central.yml');
const start=text.indexOf('  # Hub central de areas');const end=text.indexOf('  # Segundo Edge',start);
if(start<0||end<0)throw Error('Compose markers missing');
text=text.slice(0,start)+`  # Compatibility DNS for local Edges: this is an SSH relay to Oracle,
  # not a local Hub/DB. It also carries private reverse links for both areas.
  hub-nodered:
    build:
      context: .
      dockerfile: deployment/EdgeLink.Dockerfile
    image: falcon-edge-link:latest
    restart: unless-stopped
    profiles: [hub]
    ports: ["127.0.0.1:1881:1880"]
    volumes: ["./.deployment:/keys:ro"]
    networks: [falcon-net]

`+text.slice(end);
text=text.replace('  gateway:\n','  gateway:\n    profiles: [local-platform]\n').replace('      - cloudflare\n','      - local-platform\n');
fs.writeFileSync(file,text);
const p='nodered/hub-flow-backup/flows.json',flows=JSON.parse(fs.readFileSync(p));
const heartbeat=flows.find(n=>n.id==='hub_n17');
const a=heartbeat.func.indexOf('        // Bootstrap de instalacion');const b=heartbeat.func.indexOf('        seedPromise.then',a);
if(a<0||b<0)throw Error('Heartbeat markers missing');
heartbeat.func=heartbeat.func.slice(0,a)+'        // Edge credentials may report liveness, never provision central structure.\n        var seedPromise = Promise.resolve();\n\n'+heartbeat.func.slice(b);
fs.writeFileSync(p,JSON.stringify(flows,null,4)+'\n');
