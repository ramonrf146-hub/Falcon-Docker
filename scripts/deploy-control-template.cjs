// Run inside an Edge: node deploy-control-template.cjs candidate-flows.json [--check]
// Uses the existing local admin middleware. Never prints credentials.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:1880/flows';
const headers = { 'Node-RED-API-Version': 'v2', 'content-type': 'application/json' };
async function getFlows() {
    const res = await fetch(base, { headers });
    assert.equal(res.status, 200, 'Admin API must be available locally');
    return res.json();
}
(async () => {
    const candidate = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const current = await getFlows();
    assert.equal(candidate.length, current.flows.length, 'Unexpected live flow changes');
    const changes = [];
    for (const existing of current.flows) {
        const replacement = candidate.find(n => n.id === existing.id);
        assert(replacement, 'Missing live node in source');
        if (JSON.stringify(existing) !== JSON.stringify(replacement)) {
            assert(['rz_tpl_control', 'a326bfab2b19411f'].includes(existing.id), 'Only control/sensor visual templates may change');
            const { format: oldFormat, ...oldFields } = existing;
            const { format: newFormat, ...newFields } = replacement;
            assert.deepEqual(newFields, oldFields, 'Only template content may change');
            assert.deepEqual(newFormat.match(/@click="[^"]*"/g), oldFormat.match(/@click="[^"]*"/g), 'Commands must remain unchanged');
            changes.push(existing.id);
        }
    }
    console.log(JSON.stringify({ changedNodes: changes, mode: 'nodes', dryRun: process.argv.includes('--check') }));
    if (!changes.length || process.argv.includes('--check')) return;
    const backup = '/data/flows.before-actuator-icons.' + Date.now() + '.json';
    fs.copyFileSync('/data/flows.json', backup);
    const response = await fetch(base, {
        method: 'POST', headers: { ...headers, 'Node-RED-Deployment-Type': 'nodes' },
        body: JSON.stringify({ rev: current.rev, flows: candidate })
    });
    assert.equal(response.status, 200, 'Deploy rejected; inspect revision/auth before retrying');
    const deployed = await getFlows();
    assert.deepEqual(deployed.flows, candidate);
    assert.deepEqual(JSON.parse(fs.readFileSync('/data/flows.json', 'utf8')), candidate);
    console.log('Verified runtime and persisted flows; backup: ' + backup);
})().catch(err => { console.error(err.message); process.exitCode = 1; });
