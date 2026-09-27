// Targeted deployment: preserve unrelated live nodes and stored routines.
const fs=require('fs'),assert=require('assert/strict');
const ids=['rz_fn_curtain_pulse_schedule','rz_fn_ejecutar_accion','rz_fn_cargar','rz_fn_escritura_error','rz_fn_error_lectura','rz_fn_guardar_rutina','rz_fn_payload_rutinas_inicial','rz_fn_nueva_rutina','rz_fn_editar_rutina','rz_fn_toggle_rutina','rz_fn_eliminar_rutina','rz_tpl_rutinas'];
const base='http://127.0.0.1:1880',headers={'Node-RED-API-Version':'v2','content-type':'application/json'};
async function get(p){const r=await fetch(base+p,{headers});assert.equal(r.status,200);return r.json();}
(async()=>{
 const source=JSON.parse(fs.readFileSync(process.argv[2]));const current=await get('/flows');
 const ctx=(await get('/context/flow/rz_tab')).memory;
 const value=(k,d)=>ctx[k]?JSON.parse(ctx[k].msg):d;
 assert(!(value('valvulas',[])).some(v=>v.tipo==='cortina'&&['subiendo','bajando'].includes(v.estado)),'Curtains moving; deployment deferred');
 assert(!Object.values(value('rutinasCorriendo',{})).some(Boolean),'Pulse routines running; deployment deferred');
 const next=current.flows.map(old=>{
  if(!ids.includes(old.id))return old;
  const s=source.find(n=>n.id===old.id);assert(s);const field=old.type==='ui-template'?'format':'func';
  return {...old,[field]:s[field]};
 });
 assert(ids.every(id=>next.some(n=>n.id===id)));
 console.log('Checked '+ids.length+' nodes; motors stopped.');if(process.argv.includes('--check'))return;
 const backup='/data/flows.before-percent.'+Date.now()+'.json';fs.copyFileSync('/data/flows.json',backup);
 const stored=fs.readFileSync('/data/riego.json','utf8');
 const res=await fetch(base+'/flows',{method:'POST',headers:{...headers,'Node-RED-Deployment-Type':'nodes'},body:JSON.stringify({rev:current.rev,flows:next})});assert.equal(res.status,200);
 assert.deepEqual((await get('/flows')).flows,next);assert.equal(fs.readFileSync('/data/riego.json','utf8'),stored);
 console.log('Deployment verified; configuration preserved; backup '+backup);
})().catch(e=>{console.error(e.message);process.exitCode=1});
