// Shared pure helpers embedded in Node-RED functions by the build script.
function curtainPosition(entry, now) {
    if (!entry || !Number.isFinite(entry.percent)) return null;
    if (!entry.startedAt) return entry.percent;
    return Math.max(0, Math.min(100, entry.percent + entry.direction * (now - entry.startedAt) / (entry.travelSeconds * 10)));
}
function curtainMove(entry, target, travelSeconds, now) {
    const current = curtainPosition(entry, now);
    if (current === null || !Number.isFinite(target) || target < 0 || target > 100 ||
        !Number.isFinite(travelSeconds) || travelSeconds < 1 || travelSeconds > 3600) return null;
    const delta = target - current;
    return {current, direction: delta >= 0 ? 'subir' : 'bajar', durationMs: Math.abs(delta) * travelSeconds * 10};
}
