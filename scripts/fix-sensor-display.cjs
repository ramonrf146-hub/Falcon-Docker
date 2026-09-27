const fs=require('fs');
const p='nodered/riego-flow-backup/flows.json',f=JSON.parse(fs.readFileSync(p));
const extract=f.find(n=>n.id==='rz_fn_extraer_tuya');
extract.func=extract.func.replace('const estados = msg.payload || [];',`const valid = Array.isArray(msg.payload) && (!msg.statusCode || msg.statusCode === 200);
const estados = valid ? msg.payload : [];
if (!valid) node.status({fill:'red',shape:'ring',text:msg.statusCode === 401 ? 'Home Assistant: credencial rechazada (401)' : 'Home Assistant: sin lectura valida'});
else node.status({fill:'green',shape:'dot',text:'Home Assistant conectado'});`);
const view=f.find(n=>n.id==='rz_fn_procesar_lectura_sensor');
view.func=`const readings = global.get('lecturasSensores') || {};
const history = global.get('historialSensores') || {};
const list = (global.get('sensoresRegistrados') || []).filter(s=>s.habilitado !== false).map(s=>({
    ...(readings[s.id] || {}), sensorId:s.id,nombre:s.nombre,tipo:s.tipo,unidad:s.unidad,
    valor:readings[s.id]?.valor ?? null,
    ultimaLectura:readings[s.id]?.ultimaLectura || '', historial:history[s.id] || []
}));
return [msg.payload?.sensorId ? msg : null, {payload:list}];`;
f.push({id:'sens_registry_refresh',type:'inject',z:'sens_tab',name:'Mostrar sensores registrados (15s)',props:[{p:'payload'}],repeat:'15',once:true,onceDelay:3,payload:'',payloadType:'date',x:180,y:900,wires:[['rz_fn_procesar_lectura_sensor']]});
fs.writeFileSync(p,JSON.stringify(f,null,4)+'\n');
