// Recovery events are coalesced; this dispatcher never changes Manual mode.
const revision = flow.get('recoveryRevision') || 0;
if (revision === (context.get('seen') || 0)) return null;
if ((flow.get('config') || {}).modoAutomatico === false) return null;
context.set('seen', revision);
const valves = flow.get('valvulas') || [];
const zones = flow.get('zonas') || [];
const running = flow.get('rutinasCorriendo') || {};
const now = new Date(new Date().toLocaleString('en-US', {timeZone:'America/New_York'}));
const minute = now.getHours()*60+now.getMinutes(), day=now.getDay();
const pulses=[];
for (const r of flow.get('rutinas') || []) {
    if (r.enabled === false || !r.usarHorario || r.usarSensor || !r.duracion || !r.end || running[r.id]) continue;
    const ids=r.valvulaIds || [];
    if (!ids.length || ids.some(id=>!valves.some(v=>v.id===id)) || ids.some(id=>valves.find(v=>v.id===id).tipo==='cortina')) continue;
    if (ids.some(id=>{const v=valves.find(v=>v.id===id),z=zones.find(z=>z.id===v.zonaId);return !z || z.habilitada===false || z.alarma || v.estado;})) continue;
    const parse=s=>{s=String(s||'').padStart(4,'0');return /^([01]\d|2[0-3])[0-5]\d$/.test(s)?+s.slice(0,2)*60+(+s.slice(2)):NaN;};
    const start=parse(r.start),end=parse(r.end),days=String(r.dias||'').split(',').map(Number);
    const inside=start<end?days.includes(day)&&minute>=start&&minute<end:start>end&&((days.includes(day)&&minute>=start)||(days.includes((day+6)%7)&&minute<end));
    if(!inside)continue;
    const max=Math.max(1,r.maxValvulas||1);
    const minutesLeft=(end-minute+1440)%1440;
    pulses.push({payload:{rutinaId:r.id,rutinaNombre:r.nombre,tipo:'pulso',valvulaIds:ids,
        pulsoValor:r.duracion,pulsoUnidad:r.duracionUnidad||'minutos',pausaValor:r.intervalo||0,pausaUnidad:'minutos',
        modoValvulas:max>=ids.length?'simultaneo':max===1?'rotacion':'maximo',maxSimultaneas:max,
        modoFin:'horaFin',horaFin:String(r.end).padStart(4,'0').replace(/(..)(..)/,'$1:$2'),
        recoveryDeadline:Date.now()+minutesLeft*60000-now.getSeconds()*1000}});
}
node.warn('Reevaluando programacion tras recuperar conexion.');
return [{payload:{recovery:true}},pulses];
