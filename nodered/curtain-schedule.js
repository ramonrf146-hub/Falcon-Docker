// Node-RED function body. Source copied into rz_fn_curtain_pulse_schedule.
// Only scheduled routines made entirely of two-relay curtains use this engine.
const valves = flow.get('valvulas') || [];
const routines = flow.get('rutinas') || [];
const jobs = context.get('jobs') || {};
const now = Date.now();
const local = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }));
const minute = local.getHours() * 60 + local.getMinutes();
const day = local.getDay();
function minutes(value) {
    const s = String(value || '').padStart(4, '0');
    return /^\d{4}$/.test(s) && +s.slice(0, 2) < 24 && +s.slice(2) < 60 ? +s.slice(0, 2) * 60 + +s.slice(2) : NaN;
}
function target(r) {
    const start = minutes(r.start), end = minutes(r.end);
    if (!r.start || !r.end || !Number.isFinite(start) || !Number.isFinite(end) || start === end) return null;
    const days = String(r.dias || '').split(',').filter(Boolean).map(Number);
    const inside = start < end
        ? days.includes(day) && minute >= start && minute < end
        : (days.includes(day) && minute >= start) || (days.includes((day + 6) % 7) && minute < end);
    const temp = r.sensorTemp;
    const reading = (global.get('lecturasSensores') || {})[temp && temp.sensorId];
    const value = reading && reading.valor;
    const forcedClose = r.usarSensor && temp && temp.activa && value !== null && value !== undefined && Number.isFinite(Number(value)) &&
        (temp.operador === 'menor' ? Number(value) < temp.umbral : Number(value) > temp.umbral);
    return r.controlPorcentaje ? Number(inside && !forcedClose ? r.aperturaObjetivo : r.cierreObjetivo) : (inside && !forcedClose ? 'subir' : 'bajar');
}
function stop(job) {
    for (const [id, pulse] of Object.entries(job.active || {})) {
        clearTimeout(pulse.timer);
        const v = (flow.get('valvulas') || []).find(v => String(v.id) === id);
        if (v && v.origen === 'auto' && v.estado === pulse.state) node.send({ payload: { accion: 'parar', valvulaId: v.id, origen: 'auto' } });
    }
    job.active = {};
}
const eligible = routines.filter(r => r.usarHorario && (r.valvulaIds || []).length && r.valvulaIds.every(id => valves.some(v => v.id === id && v.tipo === 'cortina')));
const config = flow.get('config') || {};
const recoveryRevision = flow.get('recoveryRevision') || 0;
for (const id of Object.keys(jobs)) {
    if (!eligible.some(r => String(r.id) === id)) { stop(jobs[id]); delete jobs[id]; }
}
for (const r of eligible) {
    const desired = target(r);
    const signature = JSON.stringify([r.start, r.end, r.dias, r.valvulaIds, r.duracion, r.duracionUnidad, r.retrasoCortinasSeg, r.usarSensor, r.sensorTemp, r.controlPorcentaje, r.aperturaObjetivo, r.cierreObjetivo, r.carrerasCortinas]);
    let job = jobs[r.id];
    if (!job || job.signature !== signature) {
        if (job) stop(job);
        // Saving or restarting must not move a curtain unexpectedly. Arm the next transition.
        jobs[r.id] = { signature, target: desired, queue: [], active: {}, nextAt: now };
        continue;
    }
    if (r.enabled === false || config.modoAutomatico === false || desired === null) {
        stop(job); job.queue = []; job.target = desired; continue;
    }
    if ((job.recoverySeen || 0) !== recoveryRevision) {
        job.recoverySeen = recoveryRevision;
        const candidates = r.valvulaIds.filter(id => {
            const v = (flow.get('valvulas') || []).find(v => v.id === id);
            if (!v || job.active[id] || job.queue.includes(id)) return false;
            // A timed pulse is an edge command, not a maintained output. A
            // Modbus reconnection does not undo a pulse already completed.
            // Percentage moves still re-evaluate their remaining distance.
            return r.controlPorcentaje || !job.completed || job.completed[id] !== desired;
        });
        job.queue.push(...candidates);
    }
    if (job.target !== desired) {
        const wasMoving = Object.keys(job.active).length > 0;
        stop(job);
        job.target = desired;
        job.queue = [...r.valvulaIds];
        job.nextAt = now + (wasMoving ? 1000 : 0);
    }
    if (!job.queue.length || now < job.nextAt) continue;
    const id = job.queue[0];
    const valve = (flow.get('valvulas') || []).find(v => v.id === id);
    if (!valve) { job.queue.shift(); continue; }
    const zone = (flow.get('zonas') || []).find(z => z.id === valve.zonaId);
    if (Object.values(jobs).some(j => j.active && j.active[id])) continue;
    if (!zone || zone.habilitada === false || zone.alarma || valve.estado === 'subiendo' || valve.estado === 'bajando') continue;
    // Include commands sent this tick, before the executor has updated flow state.
    const reserved = new Set(Object.values(jobs).flatMap(j => Object.keys(j.active || {})));
    const activeCount = (flow.get('valvulas') || []).filter(v => v.zonaId === zone.id && (reserved.has(String(v.id)) || (v.tipo === 'cortina' ? ['subiendo', 'bajando'].includes(v.estado) : !!v.estado))).length;
    if (activeCount >= (zone.maxSimultaneas || 1)) continue;
    let direction = desired;
    let pulseMs = r.duracion ? Number(r.duracion) * (r.duracionUnidad === 'segundos' ? 1000 : 60000) : Number(valve.autoApagadoSeg) * 1000;
    let travelSeconds;
    if (r.controlPorcentaje) {
        const entry = (flow.get('curtainPositions') || {})[id];
        travelSeconds = Number((r.carrerasCortinas || {})[id]);
        const move = curtainMove(entry, desired, travelSeconds, now);
        if (!move || zone.alarma) {
            node.warn('Cortina ' + valve.nombre + ': verifica comunicacion, carrera y referencia de posicion antes de ejecutar porcentajes.');
            job.queue.shift(); continue;
        }
        pulseMs = move.durationMs; direction = move.direction;
        if (pulseMs < 1) { job.queue.shift(); continue; }
    }
    if (!Number.isFinite(pulseMs) || pulseMs <= 0) {
        if (!job.warned) node.warn('Configura tiempo de pulso para la rutina de cortinas: ' + r.nombre);
        job.warned = true; continue;
    }
    const gapMs = Math.max(1, Math.min(3600, Number(r.retrasoCortinasSeg) || 3)) * 1000;
    job.queue.shift();
    const pulse = { state: direction === 'subir' ? 'subiendo' : 'bajando' };
    job.active[id] = pulse;
    job.nextAt = now + gapMs;
    node.send({ payload: { accion: direction, valvulaId: id, origen: 'auto', duracionMs: pulseMs, ...(r.controlPorcentaje ? {objetivoPorcentaje: desired, carreraSeg: travelSeconds} : {}) } });
    pulse.timer = setTimeout(() => {
        if (job.active[id] !== pulse) return;
        const v = (flow.get('valvulas') || []).find(v => v.id === id);
        if (v && v.origen === 'auto' && v.estado === pulse.state) node.send({ payload: { accion: 'parar', valvulaId: id, origen: 'auto' } });
        job.completed = job.completed || {};
        job.completed[id] = desired;
        delete job.active[id];
    }, pulseMs);
}
context.set('jobs', jobs);
return null;
