const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const fn=new Function('flow','context','node','Date',fs.readFileSync('nodered/recovery-dispatch.js','utf8'));
function fixture(time='2026-09-22T10:00:00-04:00'){
 const data={recoveryRevision:1,config:{modoAutomatico:true},zonas:[{id:1}],valvulas:[{id:1,zonaId:1,tipo:'basico',estado:false}],rutinas:[{id:1,enabled:true,usarHorario:true,duracion:10,start:'0800',end:'2000',dias:'2',valvulaIds:[1]}]};const ctx={};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[Date.parse(time)]));}static now(){return Date.parse(time);}}
 return {data,run:()=>fn({get:k=>data[k]},{get:k=>ctx[k],set:(k,v)=>ctx[k]=v},{warn:()=>{}},Clock)};
}
test('one recovery restarts eligible stopped pulse inside current window once',()=>{const h=fixture();assert.equal(h.run()[1].length,1);assert.equal(h.run(),null);});
test('manual mode defers recovery until automatic',()=>{const h=fixture();h.data.config.modoAutomatico=false;assert.equal(h.run(),null);h.data.config.modoAutomatico=true;assert.equal(h.run()[1].length,1);});
test('running routine is never duplicated',()=>{const h=fixture();h.data.rutinasCorriendo={1:true};assert.equal(h.run()[1].length,0);});
test('outside window, disabled or unavailable hardware never restarts pulse',()=>{
 assert.equal(fixture('2026-09-22T21:00:00-04:00').run()[1].length,0);
 for(const change of [h=>h.data.rutinas[0].enabled=false,h=>h.data.zonas[0].alarma=true,h=>h.data.zonas[0].habilitada=false,h=>h.data.valvulas[0].estado=true]){const h=fixture();change(h);assert.equal(h.run()[1].length,0);}
});
test('overnight recovery uses previous start day and explicit remaining deadline',()=>{const h=fixture('2026-09-23T01:00:00-04:00');Object.assign(h.data.rutinas[0],{start:'2200',end:'0600'});const p=h.run()[1][0].payload;assert.equal(p.recoveryDeadline,Date.parse('2026-09-23T06:00:00-04:00'));});
