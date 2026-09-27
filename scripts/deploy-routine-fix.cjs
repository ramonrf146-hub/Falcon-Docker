// Deploy only the routine save function and form; no full flow restart.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const url = 'http://127.0.0.1:1880/flows';
const headers = {'Node-RED-API-Version':'v2','content-type':'application/json'};
const fields = {rz_fn_guardar_rutina:'func',rz_tpl_rutinas:'format'};
async function read() {
    const res = await fetch(url,{headers});
    assert.equal(res.status,200);
    return res.json();
}
(async()=>{
    const candidate = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    const current = await read();
    assert.equal(candidate.length,current.flows.length);
    const changed=[];
    for(const old of current.flows){
        const next=candidate.find(n=>n.id===old.id);
        assert(next);
        if(JSON.stringify(old)===JSON.stringify(next)) continue;
        const field=fields[old.id];
        assert(field,'Unexpected modified node: '+old.id);
        assert.deepEqual({...old,[field]:null},{...next,[field]:null});
        changed.push(old.id);
    }
    console.log(JSON.stringify({changedNodes:changed,mode:'nodes'}));
    if(!changed.length || process.argv.includes('--check')) return;
    const backup='/data/flows.before-routine-id.'+Date.now()+'.json';
    fs.copyFileSync('/data/flows.json',backup);
    const routinesBefore=JSON.parse(fs.readFileSync('/data/riego.json','utf8')).rutinas;
    const result=await fetch(url,{method:'POST',headers:{...headers,'Node-RED-Deployment-Type':'nodes'},body:JSON.stringify({rev:current.rev,flows:candidate})});
    assert.equal(result.status,200);
    assert.deepEqual((await read()).flows,candidate);
    assert.deepEqual(JSON.parse(fs.readFileSync('/data/flows.json','utf8')),candidate);
    assert.deepEqual(JSON.parse(fs.readFileSync('/data/riego.json','utf8')).rutinas,routinesBefore,'Routine data changed during deployment; inspect before further actions');
    console.log('Verified runtime/disk and unchanged routine data. Backup: '+backup);
})().catch(err=>{console.error(err.message);process.exitCode=1;});
