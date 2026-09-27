const fs=require('fs');
const path='nodered/riego-flow-backup/flows.json';
const f=JSON.parse(fs.readFileSync(path));
const helpers=fs.readFileSync('nodered/curtain-position.js','utf8');
const n=id=>f.find(n=>n.id===id);
function replace(id,old,next,field='func'){if(!n(id)[field].includes(old))throw Error('Missing target '+id);n(id)[field]=n(id)[field].replace(old,next);}
n('rz_fn_curtain_pulse_schedule').func=helpers+fs.readFileSync('nodered/curtain-schedule.js','utf8');
replace('rz_fn_ejecutar_accion','const d = msg.payload;',`const d = msg.payload;
const positions = flow.get('curtainPositions') || {};`);
replace('rz_fn_ejecutar_accion','// Actualizacion optimista:',`// Percent positioning is estimated, never inferred from an old endpoint label.
if (esCortina && activa && d.objetivoPorcentaje !== undefined) {
    const move = curtainMove(positions[valvula.id], Number(d.objetivoPorcentaje), Number(d.carreraSeg), Date.now());
    if (!move || zona.alarma || move.durationMs < 1 || move.direction !== accionFinal) return null;
    d.duracionMs = move.durationMs;
}
if (esCortina) {
    const previous = positions[valvula.id];
    const percent = curtainPosition(previous, Date.now());
    const travelSeconds = Number(d.carreraSeg || (previous && previous.travelSeconds));
    positions[valvula.id] = percent === null || !Number.isFinite(travelSeconds) || travelSeconds <= 0 ? null : {
        percent, travelSeconds, startedAt: activa ? Date.now() : null,
        direction: accionFinal === 'subir' ? 1 : -1
    };
    flow.set('curtainPositions', positions);
}
// Actualizacion optimista:`);
n('rz_fn_ejecutar_accion').func=helpers+n('rz_fn_ejecutar_accion').func;
replace('rz_fn_ejecutar_accion','valvulas[idx] = Object.assign',`if (esCortina && accionFinal === 'parar') {
    const estimated = curtainPosition(positions[valvula.id], Date.now());
    nuevaPosicion = estimated === 0 ? 'abajo' : estimated === 100 ? 'arriba' : null;
}
valvulas[idx] = Object.assign`);
replace('rz_fn_cargar',"flow.set('rutinaEnCurso', null);","flow.set('curtainPositions', {}); // Position cannot be trusted after restart.\nflow.set('rutinaEnCurso', null);");
replace('rz_fn_escritura_error',"if (!valvula) return null;",`if (!valvula) return null;
const positions = flow.get('curtainPositions') || {};
delete positions[id]; flow.set('curtainPositions', positions);`);
replace('rz_fn_error_lectura',"if (zonaId === undefined) return null;",`if (zonaId === undefined) return null;
const positions = flow.get('curtainPositions') || {};
for (const v of flow.get('valvulas') || []) if (v.zonaId === zonaId) delete positions[v.id];
flow.set('curtainPositions', positions);`);
replace('rz_fn_guardar_rutina','if (faltantes.length) return',`if (d.controlPorcentaje) {
    if (!esHorarioCortinas(d)) faltantes.push('porcentajes requieren horario y solo cortinas');
    for (const field of ['aperturaObjetivo','cierreObjetivo']) {
        if (d[field] === '' || d[field] == null || !Number.isFinite(Number(d[field])) || Number(d[field]) < 0 || Number(d[field]) > 100) faltantes.push(field + ' entre 0 y 100');
    }
    for (const id of d.valvulaIds || []) {
        const seconds = Number((d.carrerasCortinas || {})[id]);
        if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) faltantes.push('carrera de cortina ' + id + ' entre 1 y 3600 segundos');
        const ref = (d.referenciasCortinas || {})[id];
        if (ref !== undefined && ref !== null && ref !== '') {
            const v = valvulas.find(v => v.id === id);
            if (!Number.isFinite(Number(ref)) || Number(ref) < 0 || Number(ref) > 100 || !v || ['subiendo','bajando'].includes(v.estado)) faltantes.push('referencia valida con cortina detenida ' + id);
        }
    }
}
if (faltantes.length) return`);
replace('rz_fn_guardar_rutina',"if (!Number.isFinite(pulsoSeg) || pulsoSeg < 0.1 || pulsoSeg > 3600)","if (!d.controlPorcentaje && (!Number.isFinite(pulsoSeg) || pulsoSeg < 0.1 || pulsoSeg > 3600))");
replace('rz_fn_guardar_rutina','const guardada = {',`if (d.controlPorcentaje) {
    const positions = flow.get('curtainPositions') || {};
    for (const id of valvulasValidas) {
        const ref = (d.referenciasCortinas || {})[id];
        if (ref !== undefined && ref !== null && ref !== '') positions[id] = {percent: Number(ref), travelSeconds: Number(d.carrerasCortinas[id]), startedAt: null};
    }
    flow.set('curtainPositions', positions);
}
const guardada = {
    controlPorcentaje: !!d.controlPorcentaje,
    aperturaObjetivo: Number(d.aperturaObjetivo ?? 100), cierreObjetivo: Number(d.cierreObjetivo ?? 0),
    carrerasCortinas: Object.fromEntries(valvulasValidas.map(id => [id, Number((d.carrerasCortinas || {})[id]) || 120])),`);
const defaults="controlPorcentaje: false, aperturaObjetivo: 100, cierreObjetivo: 0, carrerasCortinas: {}, referenciasCortinas: {}, estimacionesCortinas: {},";
for(const id of ['rz_fn_payload_rutinas_inicial','rz_fn_guardar_rutina','rz_fn_toggle_rutina','rz_fn_eliminar_rutina'])replace(id,'formVisible: false',defaults+'\n    formVisible: false');
replace('rz_fn_nueva_rutina','formVisible: true',defaults+'\n    formVisible: true');
replace('rz_fn_editar_rutina','formVisible: true',`controlPorcentaje: !!r.controlPorcentaje, aperturaObjetivo: r.aperturaObjetivo ?? 100, cierreObjetivo: r.cierreObjetivo ?? 0,
    carrerasCortinas: {...(r.carrerasCortinas || {})}, referenciasCortinas: {},
    estimacionesCortinas: Object.fromEntries((r.valvulaIds || []).map(id => [id, curtainPosition((flow.get('curtainPositions') || {})[id], Date.now())])),
    formVisible: true`);
n('rz_fn_editar_rutina').func=helpers+n('rz_fn_editar_rutina').func;
replace('rz_tpl_rutinas', '<div style="font-size:11px; color:#0E7C86; font-weight:700;">Apertura y cierre por pulsos</div>',`<div style="font-size:11px; color:#0E7C86; font-weight:700;">Control de cortinas</div>
      <label><input type="checkbox" v-model="msg.payload.controlPorcentaje" /> Posicion objetivo por porcentaje</label>
      <div v-if="msg.payload.controlPorcentaje" style="display:flex; flex-direction:column; gap:12px;">
        <label>Apertura al inicio (%) <input type="number" min="0" max="100" v-model.number="msg.payload.aperturaObjetivo" /></label>
        <label>Apertura al final (%) <input type="number" min="0" max="100" v-model.number="msg.payload.cierreObjetivo" /></label>
        <div v-for="id in msg.payload.valvulaIds" :key="id" style="padding:10px;background:white;border-radius:10px;">
          <strong>{{ (msg.payload.zonas || []).flatMap(z => z.valvulas || []).find(v => v.id === id)?.nombre || id }}</strong>
          <div>Posicion estimada: {{ msg.payload.estimacionesCortinas?.[id] == null ? 'Desconocida' : Math.round(msg.payload.estimacionesCortinas[id]) + '%' }}</div>
          <label>Carrera completa (segundos) <input type="number" min="1" max="3600" v-model.number="msg.payload.carrerasCortinas[id]" /></label>
          <label>Confirmar posicion actual (%) <input type="number" min="0" max="100" placeholder="Sin cambiar" v-model.number="msg.payload.referenciasCortinas[id]" /></label>
        </div>
        <small>0% = cerrada, 100% = abierta. Tiempo = carrera × diferencia de porcentaje / 100. Confirma la posicion solo tras verificar fisicamente la cortina detenida. Deja la referencia vacia para conservar la estimacion. Tras reinicio o fallo de comunicacion se requiere una nueva referencia. Guardar no mueve el motor.</small>
      </div>`, 'format');
replace('rz_tpl_rutinas',"{{ rzEsHorarioCortinas() ? 'Tiempo de pulso (apertura y cierre)' : t('rutinas.duracion') }}", "{{ rzEsHorarioCortinas() ? (msg.payload.controlPorcentaje ? 'Pulso fijo (no usado en modo porcentaje)' : 'Tiempo de pulso (apertura y cierre)') : t('rutinas.duracion') }}",'format');
for (const node of f.filter(n=>n.type==='function'))new Function('msg','node','flow','context','global',node.func);
fs.writeFileSync(path,JSON.stringify(f,null,4)+'\n');
