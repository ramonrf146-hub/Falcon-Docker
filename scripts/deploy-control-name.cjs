const fs=require('node:fs'),assert=require('node:assert/strict');
const headers={'Node-RED-API-Version':'v2','content-type':'application/json'};
const url='http://127.0.0.1:1880/flows';
async function read(){const r=await fetch(url,{headers});assert.equal(r.status,200);return r.json();}
(async()=>{
 const candidate=JSON.parse(fs.readFileSync(process.argv[2]));const current=await read();
 assert.equal(candidate.length,current.flows.length);
 const allowed=['a326bfab2b19411f','rz_tpl_control','auth_tpl_config_gate','rz_tpl_config','rz_tpl_rutinas'];
 const changed=[];
 for(const old of current.flows){
  const next=candidate.find(n=>n.id===old.id);assert(next);
  if(JSON.stringify(next)===JSON.stringify(old))continue;
  if(old.id==='rz_page_control')assert.deepEqual(next,{...old,name:'Control'});
  else {assert(allowed.includes(old.id));assert.deepEqual(next,{...old,format:old.format.replaceAll("{ es: 'Riego', en: 'Irrigation' }","{ es: 'Control', en: 'Control' }")});}
  changed.push(old.id);
 }
 const backup='/data/flows.before-control-name.'+Date.now()+'.json';fs.copyFileSync('/data/flows.json',backup);
 const routines=JSON.parse(fs.readFileSync('/data/riego.json')).rutinas;
 const r=await fetch(url,{method:'POST',headers:{...headers,'Node-RED-Deployment-Type':'nodes'},body:JSON.stringify({rev:current.rev,flows:candidate})});assert.equal(r.status,200);
 assert.deepEqual((await read()).flows,candidate);assert.deepEqual(JSON.parse(fs.readFileSync('/data/flows.json')),candidate);
 assert.deepEqual(JSON.parse(fs.readFileSync('/data/riego.json')).rutinas,routines);
 console.log(JSON.stringify({changed,backup,verified:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
