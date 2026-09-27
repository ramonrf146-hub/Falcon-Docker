const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const flows=require('../nodered/riego-flow-backup/flows.json');
const source=fs.readFileSync(require.resolve('../nodered/curtain-position.js'),'utf8')+fs.readFileSync(require.resolve('../nodered/curtain-schedule.js'),'utf8');
const fn=new Function('flow','context','global','node','Date','setTimeout','clearTimeout',source);
test('percentage calculation uses remaining distance in both directions and rejects unknown position',()=>{
 const {curtainMove,curtainPosition}=new Function(fs.readFileSync(require.resolve('../nodered/curtain-position.js'),'utf8')+';return {curtainMove,curtainPosition}')();
 assert.equal(curtainMove({percent:30},50,120,1000).durationMs,24000);
 assert.equal(curtainMove({percent:0},50,120,1000).durationMs,60000);
 assert.equal(curtainMove({percent:50},0,120,1000).direction,'bajar');
 assert.equal(curtainMove({percent:50},50,120,1000).durationMs,0);
 assert.equal(curtainMove(null,50,120,1000),null);
 assert.equal(curtainMove({percent:30},101,120,1000),null);
 assert.equal(curtainPosition({percent:30,startedAt:1000,direction:1,travelSeconds:120},13000),40);
});
test('percentage routine opens only remaining 20 percent and then stops',()=>{
 const h=harness({controlPorcentaje:true,aperturaObjetivo:50,cierreObjetivo:0,carrerasCortinas:{1:120},valvulaIds:[1]});
 h.state.curtainPositions={1:{percent:30,travelSeconds:120}};
 h.advance(1000);assert.equal(h.events[0].duracionMs,24000);assert.equal(h.events[0].accion,'subir');
 h.advance(24000);assert.equal(h.events[1].accion,'parar');
});
test('unknown percentage reference never moves the motor',()=>{
 const h=harness({controlPorcentaje:true,aperturaObjetivo:50,cierreObjetivo:0,carrerasCortinas:{1:120},valvulaIds:[1]});
 h.advance(1000);assert.equal(h.events.length,0);
});
test('recovery inside window corrects known percentage without waiting for next edge',()=>{
 const h=harness({controlPorcentaje:true,aperturaObjetivo:50,cierreObjetivo:0,carrerasCortinas:{1:120},valvulaIds:[1]});
 h.advance('2026-09-20T10:00:00-04:00');assert.equal(h.events.length,0);
 h.state.curtainPositions={1:{percent:30,travelSeconds:120}};h.state.recoveryRevision=1;h.tick();
 assert.equal(h.events[0].duracionMs,24000);h.tick();assert.equal(h.events.length,1);
});
function harness(overrides={}) {
    let now=Date.parse('2026-09-20T07:59:59-04:00'), serial=0;
    const timers=new Map(), ctx={}, events=[];
    const r={id:1,nombre:'Curtains',usarHorario:true,enabled:true,start:'0800',end:'2000',dias:'0',valvulaIds:[1,2,3],duracion:20,duracionUnidad:'segundos',retrasoCortinasSeg:5,...overrides};
    const state={rutinas:[r],config:{modoAutomatico:true},zonas:[{id:1,habilitada:true,maxSimultaneas:3}],valvulas:[1,2,3].map(id=>({id,tipo:'cortina',zonaId:1,estado:'detenida',autoApagadoSeg:10}))};
    const flow={get:k=>state[k],set:(k,v)=>state[k]=v};
    const context={get:k=>ctx[k],set:(k,v)=>ctx[k]=v};
    class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));} static now(){return now;}}
    const node={warn:()=>{},send:({payload:p})=>{events.push({at:now,...p});const v=state.valvulas.find(v=>v.id===p.valvulaId);v.estado=p.accion==='parar'?'detenida':p.accion==='subir'?'subiendo':'bajando';v.origen=p.origen;}};
    const tick=()=>fn(flow,context,{get:()=>({})},node,Clock,(cb,ms)=>{timers.set(++serial,{at:now+ms,cb});return serial;},id=>timers.delete(id));
    function advance(time){const end=typeof time==='string'?Date.parse(time):now+time;while(true){const first=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!first||first[1].at>end)break;now=first[1].at;timers.delete(first[0]);first[1].cb();}now=end;tick();}
    tick();
    return {state,r,events,advance,tick,ctx,node};
}
test('deployed function equals maintained source and all function nodes compile',()=>{
    assert.equal(flows.find(n=>n.id==='rz_fn_curtain_pulse_schedule').func,source);
    for(const n of flows.filter(n=>n.type==='function'))new Function('msg','node','flow','global','context',n.func);
});
test('opening and closing each pulse once, stagger between starts with overlap',()=>{
    const h=harness();h.advance(1000);h.advance(5000);h.advance(5000);
    assert.deepEqual(h.events.map(e=>e.accion),['subir','subir','subir']);
    assert.deepEqual(h.events.map(e=>e.at-h.events[0].at),[0,5000,10000]);
    h.advance(20000);
    assert.deepEqual(h.events.slice(3).map(e=>e.at-h.events[0].at),[20000,25000,30000]);
    assert(h.state.valvulas.every(v=>v.estado==='detenida'));
    h.advance('2026-09-20T15:00:00-04:00');assert.equal(h.events.length,6);
    h.advance('2026-09-20T20:00:00-04:00');h.advance(5000);h.advance(5000);h.advance(20000);
    assert.deepEqual(h.events.slice(6).map(e=>e.accion),['bajar','bajar','bajar','parar','parar','parar']);
    h.advance(60000);assert.equal(h.events.length,12);
});
for(const mode of ['pause','delete','manual','edit'])test(mode+' cancels active pulse and pending starts',()=>{
    const h=harness();h.advance(1000);
    if(mode==='pause')h.r.enabled=false;
    if(mode==='delete')h.state.rutinas=[];
    if(mode==='manual')h.state.config.modoAutomatico=false;
    if(mode==='edit')h.r.duracion=25;
    h.advance(1000);h.advance(60000);
    assert.deepEqual(h.events.map(e=>e.accion),['subir','parar']);
});
test('overnight closes on following day even when that day is not selected',()=>{
    const h=harness({start:'2000',end:'0800'});
    h.advance('2026-09-20T20:00:00-04:00');h.advance(30000);
    h.advance('2026-09-21T08:00:00-04:00');
    assert.equal(h.events.at(-1).accion,'bajar');
});
test('capacity delays start until a slot opens; pulses still stop at own duration',()=>{
    const h=harness();h.state.zonas[0].maxSimultaneas=1;
    h.advance(1000);h.advance(5000);assert.equal(h.events.length,1);
    h.advance(15000);assert.deepEqual(h.events.map(e=>e.accion),['subir','parar','subir']);
});
test('manual intervention is not stopped by an old automatic timer',()=>{
    const h=harness();h.advance(1000);h.state.valvulas[0].origen='manual';h.advance(20000);
    assert(!h.events.some(e=>e.accion==='parar'&&e.valvulaId===1));
});
test('disabled zone never receives a start',()=>{
    const h=harness();h.state.zonas[0].habilitada=false;h.advance(1000);h.advance(5000);assert.equal(h.events.length,0);
});
test('end interrupts long opening pulses before starting opposite direction',()=>{
    const h=harness({end:'0801',duracion:120});h.advance(1000);h.advance('2026-09-20T08:01:00-04:00');
    assert.equal(h.events.at(-1).accion,'parar');h.advance(1000);assert.equal(h.events.at(-1).accion,'bajar');
});
test('restart arms current state without catch-up movement',()=>{
    const h=harness();h.advance(1000);h.advance(30000);h.ctx.jobs={};const count=h.events.length;
    h.tick();h.advance(1000);assert.equal(h.events.length,count);
});
test('legacy blank duration uses configured per-curtain timeout',()=>{
    const h=harness({duracion:''});h.advance(1000);assert.equal(h.events[0].duracionMs,10000);
});
test('old cron recreation and generic motor ignore pure curtain schedules',()=>{
    const h=harness();const flow={get:k=>h.state[k]};
    for(const [id,payload] of [['rz_fn_recrear_cron_item',h.r],['rz_fn_motor_pulsos',{rutinaId:1}]]){
        const run=new Function('msg','flow',flows.find(n=>n.id===id).func);
        assert.equal(run({payload},flow),null);
    }
});
test('curtain form save preserves identity and emits no repeating cron or catch-up',()=>{
    const h=harness();const flow={get:k=>h.state[k],set:(k,v)=>h.state[k]=v};
    const run=new Function('msg','flow','global','node',flows.find(n=>n.id==='rz_fn_guardar_rutina').func);
    const result=run({payload:{...h.r,dias:[0],editandoId:1}},flow,{get:()=>()=>({})},{warn:()=>{}});
    assert.equal(result[1],null);assert.equal(result[5],null);assert.equal(h.state.rutinas.length,1);assert.equal(h.state.rutinas[0].id,1);
    for(const bad of [{duracion:0},{end:''},{end:'0800'},{retrasoCortinasSeg:0},{end:'2500'}]){
        const previous=structuredClone(h.state.rutinas);
        const rejected=run({payload:{...h.r,dias:[0],editandoId:1,...bad}},flow,{get:()=>()=>({})},{warn:()=>{}});
        assert.match(rejected[3].payload,/Falta/);assert.deepEqual(h.state.rutinas,previous);
    }
});
test('reservations enforce capacity across routines before executor updates arrive',()=>{
    const h=harness({valvulaIds:[1]});h.state.zonas[0].maxSimultaneas=1;
    h.state.rutinas.push({...h.r,id:2,valvulaIds:[2]});h.tick();
    const send=h.node.send;h.node.send=msg=>{send(msg);h.state.valvulas.find(v=>v.id===msg.payload.valvulaId).estado='detenida';};
    h.advance(1000);assert.equal(h.events.length,1);
});

test('completed opening is not replayed by repeated Modbus zone recoveries; closing still runs once',()=>{
    const h=harness({valvulaIds:[1]});
    h.advance(1000);h.advance(20000);
    assert.deepEqual(h.events.map(e=>e.accion),['subir','parar']);
    for(let revision=1;revision<=5;revision++){
        h.state.recoveryRevision=revision;h.state.recoveryZones={1:revision};
        h.tick();h.advance(21000);
    }
    assert.deepEqual(h.events.map(e=>e.accion),['subir','parar']);
    h.advance('2026-09-20T20:00:00-04:00');h.advance(20000);
    h.state.recoveryRevision=6;h.state.recoveryZones={1:6};h.tick();h.advance(21000);
    assert.deepEqual(h.events.map(e=>e.accion),['subir','parar','bajar','parar']);
});

test('recovery can still execute a curtain target never completed in current session',()=>{
    const h=harness({valvulaIds:[1]});
    h.advance('2026-09-20T10:00:00-04:00');
    h.state.recoveryRevision=1;h.state.recoveryZones={1:1};h.tick();h.advance(20000);
    assert.deepEqual(h.events.map(e=>e.accion),['subir','parar']);
});
