const fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const url='http://localhost:1880/flows',headers={'Node-RED-API-Version':'v2','content-type':'application/json'};
 const current=await (await fetch(url,{headers})).json();const source=JSON.parse(fs.readFileSync(process.argv[2]));
 const ids=['rz_fn_extraer_tuya','rz_fn_procesar_lectura_sensor'];
 const next=current.flows.map(n=>ids.includes(n.id)?{...n,func:source.find(s=>s.id===n.id).func}:n);
 if(!next.some(n=>n.id==='sens_registry_refresh'))next.push(source.find(n=>n.id==='sens_registry_refresh'));
 fs.copyFileSync('/data/flows.json','/data/flows.before-sensor-display.'+Date.now()+'.json');
 const r=await fetch(url,{method:'POST',headers:{...headers,'Node-RED-Deployment-Type':'nodes'},body:JSON.stringify({rev:current.rev,flows:next})});assert.equal(r.status,200);
 assert.deepEqual((await (await fetch(url,{headers})).json()).flows,next);console.log('Sensor nodes deployed and verified');
})().catch(e=>{console.error(e.message);process.exitCode=1});
