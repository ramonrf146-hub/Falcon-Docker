const { test } = require('node:test');
const assert = require('node:assert/strict');
const flows = require('../nodered/riego-flow-backup/flows.json');
const byId = id => flows.find(n => n.id === id);
function harness() {
    const routine = { id: 12345, nombre: 'Original', enabled: false, usarHorario: true, usarSensor: false, start: '0600', end: '0700', dias: '1,3', duracion: 30, duracionUnidad: 'segundos', valvulaIds: [10], maxValvulas: 1 };
    const state = { rutinas: [routine], valvulas: [{ id: 10 }] };
    const flow = { get: k => state[k], set: (k,v) => { state[k] = v; } };
    const global = { get: () => () => ({ rutinas: structuredClone(state.rutinas) }) };
    const run = (id, payload) => new Function('msg', 'flow', 'global', 'node', byId(id).func)({ payload }, flow, global, { warn: () => {} });
    const form = run('rz_fn_editar_rutina', { id: routine.id }).payload;
    return { state, run, form };
}
function browserSave(payload) {
    const format = byId('rz_tpl_rutinas').format;
    const handler = [...format.matchAll(/@click="([^"]+)"/g)].map(m => m[1]).find(s => s.includes("accion:'guardarRutina'"));
    let sent;
    new Function('msg', 'send', handler)({payload}, msg => { sent = structuredClone(msg.payload); });
    return sent;
}
test('edit form -> browser save -> same routine and cron identity, repeatedly', () => {
    const h = harness();
    for (const nombre of ['Renamed once', 'Renamed twice']) {
        const result = h.run('rz_fn_guardar_rutina', browserSave({...h.form, nombre, duracion: 45}));
        assert.equal(h.state.rutinas.length, 1);
        assert.equal(h.state.rutinas[0].id, 12345);
        assert.equal(h.state.rutinas[0].nombre, nombre);
        assert.equal(h.state.rutinas[0].duracion, 45);
        assert.equal(result[0].payload.name, 'rutina_12345');
        assert.equal(result[1].payload.name, 'rutina_12345');
        assert.equal(result[1].payload.payload.rutinaId, 12345);
        assert.equal(result[4].payload.formVisible, false);
    }
});
test('already-open old form with editandoId only updates instead of duplicating', () => {
    const h = harness();
    h.run('rz_fn_guardar_rutina', { ...h.form, nombre: 'Old browser' });
    assert.equal(h.state.rutinas.length, 1);
    assert.equal(h.state.rutinas[0].nombre, 'Old browser');
});
test('string transport ID preserves the numeric stored ID; legacy id also works', () => {
    for (const identity of [{editandoId:'12345'}, {editandoId:undefined,id:'12345'}]) {
        const h = harness();
        h.run('rz_fn_guardar_rutina', {...h.form,...identity});
        assert.equal(h.state.rutinas.length, 1);
        assert.equal(h.state.rutinas[0].id, 12345);
    }
});
test('editing a deleted routine fails without recreating it or emitting cron commands', () => {
    const h = harness();
    const previous = structuredClone(h.state.rutinas);
    const result = h.run('rz_fn_guardar_rutina', {...h.form,editandoId:999});
    assert.deepEqual(h.state.rutinas, previous);
    for (const i of [0,1,2,4,5]) assert.equal(result[i], null);
    assert.match(result[3].payload, /ya no existe/);
});
test('new routine creates a distinct entry, ignoring a stale form id', () => {
    const h = harness();
    const form = h.run('rz_fn_nueva_rutina', {}).payload;
    const payload = browserSave({...form,id:12345,nombre:'New',start:'0600',dias:[1],duracion:10,valvulaIds:[10],enabled:false});
    assert.equal(payload.id, null);
    h.run('rz_fn_guardar_rutina', payload);
    assert.equal(h.state.rutinas.length, 2);
    assert.equal(h.state.rutinas[0].nombre, 'Original');
    assert.notEqual(h.state.rutinas[1].id,12345);
});
