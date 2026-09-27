// Run inside an Edge container. Refuse to replace a running pulse motor.
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:1880';
const headers={'Node-RED-API-Version':'v2','content-type':'application/json'};
async function get(path){const r=await fetch(base+path,{headers});assert.equal(r.status,200);return r.json();}
const fields={rz_fn_guardar_rutina:'func',rz_tpl_rutinas:'format',rz_fn_recrear_cron_item:'func',rz_fn_toggle_rutina:'func',rz_fn_evaluar_sensor_rutinas:'func',rz_fn_evaluar_rutinas_cortina_horario:'func',rz_fn_motor_pulsos:'func'};
const added=['rz_fn_curtain_pulse_schedule','rz_inject_curtain_pulses'];
(async()=>{
    const candidate=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    const current=await get('/flows');
    const changed=[];
    for(const old of current.flows){
        const next=candidate.find(n=>n.id===old.id);assert(next,'Missing '+old.id);
        if(JSON.stringify(old)===JSON.stringify(next))continue;
        const field=fields[old.id];assert(field,'Unexpected changed node '+old.id);
        assert.deepEqual({...old,[field]:null},{...next,[field]:null});changed.push(old.id);
    }
    const newNodes=candidate.filter(n=>!current.flows.some(o=>o.id===n.id));
    assert.deepEqual(newNodes.map(n=>n.id).sort(),added.slice().sort());
    assert.equal(candidate.length,current.flows.length+2);
    const ctx=(await get('/context/flow/rz_tab')).memory;
    const value=(key,fallback)=>ctx[key]?JSON.parse(ctx[key].msg):fallback;
    const running=value('rutinasCorriendo',{});
    const moving=value('valvulas',[]).filter(v=>v.tipo==='cortina'&&['subiendo','bajando'].includes(v.estado));
    console.log(JSON.stringify({changed,newNodes:newNodes.map(n=>n.id),running,movingCurtains:moving.map(v=>v.nombre)}));
    assert(!Object.values(running).some(Boolean),'Pause running pulse routines before deploying');
    assert.equal(moving.length,0,'Wait for curtains to stop before deploying');
    if(process.argv.includes('--check'))return;
    const backup='/data/flows.before-curtain-pulses.'+Date.now()+'.json';
    fs.copyFileSync('/data/flows.json',backup);
    const routines=JSON.parse(fs.readFileSync('/data/riego.json','utf8')).rutinas;
    const res=await fetch(base+'/flows',{method:'POST',headers:{...headers,'Node-RED-Deployment-Type':'nodes'},body:JSON.stringify({rev:current.rev,flows:candidate})});
    assert.equal(res.status,200);
    assert.deepEqual((await get('/flows')).flows,candidate);
    assert.deepEqual(JSON.parse(fs.readFileSync('/data/flows.json','utf8')),candidate);
    assert.deepEqual(JSON.parse(fs.readFileSync('/data/riego.json','utf8')).rutinas,routines);
    console.log('Runtime/disk verified; routine configuration unchanged. Backup: '+backup);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
