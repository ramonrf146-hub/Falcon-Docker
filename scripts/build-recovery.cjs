const fs=require('fs'),p='nodered/riego-flow-backup/flows.json',f=JSON.parse(fs.readFileSync(p));
const n=id=>f.find(n=>n.id===id);
function rep(id,a,b){if(!n(id).func.includes(a))throw Error(id);n(id).func=n(id).func.replace(a,b);}
rep('rz_fn_cargar',"flow.set('fallosZona', {});",`flow.set('fallosZona', {});
flow.set('hubConnectionLost', true);
flow.set('lostZones', Object.fromEntries((flow.get('zonas') || []).map(z=>[z.id,true])));`);
rep('hub_hb_fn_handle','    markCheck();\n    return null;','    flow.set("hubConnectionLost", true);\n    markCheck();\n    return null;');
rep('hub_hb_fn_handle','if (body.ok === true) {',`if (body.ok === true) {
    if (flow.get('hubConnectionLost')) {
        flow.set('recoveryRevision', (flow.get('recoveryRevision') || 0) + 1);
    }
    flow.set('hubConnectionSeen', true); flow.set('hubConnectionLost', false);`);
for(const [id,key] of [['rz_fn_error_lectura','zonaId'],['rz_fn_escritura_error','valvula.zonaId']]){
 const anchor=id==='rz_fn_error_lectura'?'if (zonaId === undefined) return null;':'if (!valvula) return null;';
 rep(id,anchor,anchor+`\nconst lostZones=flow.get('lostZones') || {};lostZones[${key}]=true;flow.set('lostZones',lostZones);`);
}
rep('rz_fn_reconciliar_lectura','const lecturas = msg.payload;',`const lecturas = msg.payload;
if (!Array.isArray(lecturas)) return null;
const lostZones=flow.get('lostZones') || {};
const seenZones=flow.get('seenZones') || {};
if (lostZones[zonaId]) {
    const revision=(flow.get('recoveryRevision') || 0)+1;
    flow.set('recoveryRevision',revision);
    const recovered=flow.get('recoveryZones') || {};recovered[zonaId]=revision;flow.set('recoveryZones',recovered);
}
seenZones[zonaId]=true;delete lostZones[zonaId];flow.set('seenZones',seenZones);flow.set('lostZones',lostZones);`);
rep('rz_fn_motor_pulsos','function dentroDeVentana(horaFin) {','function dentroDeVentana(horaFin) {\n    if (cfg.recoveryDeadline) return Date.now() < cfg.recoveryDeadline;');
// Continuous rules already compare real readback every 30 s. Trigger them now as well.
rep('rz_fn_evaluar_rutinas_cortina_horario',"const valvulas = flow.get('valvulas') || [];","if ((flow.get('config') || {}).modoAutomatico === false) return null;\nconst valvulas = flow.get('valvulas') || [];");
rep('rz_fn_evaluar_rutinas_cortina_horario','        if (!v) return;','        if (!v) return;\n        const zone=(flow.get("zonas") || []).find(z=>z.id===v.zonaId);\n        if (!zone || zone.habilitada===false || zone.alarma) return;');
n('rz_fn_curtain_pulse_schedule').func=fs.readFileSync('nodered/curtain-position.js','utf8')+fs.readFileSync('nodered/curtain-schedule.js','utf8');
f.push({id:'rz_fn_recovery_dispatch',type:'function',z:'rz_tab',name:'Reevaluar tras recuperar conexion',func:fs.readFileSync('nodered/recovery-dispatch.js','utf8'),outputs:2,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x:450,y:1420,wires:[['rz_fn_evaluar_rutinas_cortina_horario'],['rz_fn_motor_pulsos']]});
n('rz_inject_curtain_pulses').wires[0].push('rz_fn_recovery_dispatch');
for(const x of f.filter(x=>x.type==='function'))new Function('msg','flow','context','node','global',x.func);
fs.writeFileSync(p,JSON.stringify(f,null,4)+'\n');
