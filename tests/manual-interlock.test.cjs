const {test}=require('node:test'),assert=require('node:assert/strict');
const f=require('../nodered/riego-flow-backup/flows.json');
test('executor tracks partial stop and uses remaining distance for next target',()=>{
 let now=1000;class Clock extends Date{static now(){return now;}}
 const data={config:{modoAutomatico:true},zonas:[{id:1,maxSimultaneas:3}],valvulas:[{id:1,zonaId:1,tipo:'cortina',estado:'detenida'}],curtainPositions:{1:{percent:30,travelSeconds:120}}};
 const flow={get:k=>data[k],set:(k,v)=>data[k]=v};
 const fn=new Function('msg','flow','global','context','node','setTimeout','clearTimeout','Date',f.find(n=>n.id==='rz_fn_ejecutar_accion').func);
 const send=p=>fn({payload:{valvulaId:1,origen:'auto',...p}},flow,{get:()=>null},{get:()=>({}),set:()=>{}},{warn:()=>{}},()=>1,()=>{},Clock);
 send({accion:'subir',objetivoPorcentaje:50,carreraSeg:120});assert.equal(data.valvulas[0].duracionMs,24000);
 now+=12000;send({accion:'parar'});assert.equal(data.curtainPositions[1].percent,40);assert.equal(data.valvulas[0].posicion,null);
 send({accion:'subir',objetivoPorcentaje:50,carreraSeg:120});assert.equal(data.valvulas[0].duracionMs,12000);
 now+=12000;send({accion:'parar'});assert.equal(data.curtainPositions[1].percent,50);
 send({accion:'bajar',objetivoPorcentaje:0,carreraSeg:120});assert.equal(data.valvulas[0].duracionMs,60000);
});
function run(action,origin,automatic,type='basico',state=false){
 const data={config:{modoAutomatico:automatic},zonas:[{id:1,maxSimultaneas:4,unitid:1}],valvulas:[{id:1,zonaId:1,tipo:type,estado:state,canal:0,canalSubir:1,canalBajar:2}]};
 const before=structuredClone(data);let timers=0;
 const flow={get:k=>data[k],set:(k,v)=>data[k]=v};
 const fn=new Function('msg','flow','global','context','node','setTimeout','clearTimeout',f.find(n=>n.id==='rz_fn_ejecutar_accion').func);
 const result=fn({payload:{accion:action,origen:origin,valvulaId:1}},flow,{get:()=>null},{get:()=>({}),set:()=>{}},{warn:()=>{}},()=>++timers,()=>{});
 return {data,before,result,timers};
}
test('automatic blocks manual and unspecified activation with no state/write/timer effect',()=>{
 for(const mode of [true,undefined])for(const origin of ['manual',undefined,'unknown'])for(const action of ['abrir','subir','bajar']){
  const h=run(action,origin,mode,action==='abrir'?'basico':'cortina','detenida');
  assert.equal(h.result[0],null);assert.deepEqual(h.data,h.before);assert.equal(h.timers,0);
 }
});
test('manual mode permits manual activation; automatic permits routine activation',()=>{
 for(const [mode,origin] of [[false,'manual'],[true,'auto']])for(const action of ['abrir','subir','bajar']){
  const h=run(action,origin,mode,action==='abrir'?'basico':'cortina',false);
  assert.equal(h.result[0].payload.value,true);assert.equal(h.timers,1);
 }
});
test('manual stop and watchdog stop remain available in automatic mode',()=>{
 for(const origin of ['manual','watchdog','auto'])for(const type of ['basico','cortina']){
  const h=run(type==='basico'?'cerrar':'parar',origin,true,type,type==='basico'?true:'subiendo');
  assert.equal(h.result[0].payload.value,false);assert.equal(h.timers,0);
 }
});
test('old browser cannot spoof auto origin through manual click handler',()=>{
 const fn=new Function('msg','flow',f.find(n=>n.id==='rz_fn_click_valvula').func);
 for(const [type,direction,state] of [['basico',undefined,false],['cortina','subir','detenida'],['cortina','bajar','detenida']]){
  const flow={get:k=>k==='config'?{modoAutomatico:true}:[{id:1,tipo:type,estado:state}]};
  assert.equal(fn({payload:{valvulaId:1,direccion:direction,origen:'auto'}},flow),null);
 }
});
