function findClosestBeacon(devices = [], macToPosition = {}) {
    let best = null;
    for (const dev of devices) {
        const mac = dev.mac?.toUpperCase();
        const position = macToPosition[mac];
        if (!position) continue;
        if (!best || dev.rssi > best.rssi) {
            best = { mac: dev.mac, rssi: dev.rssi, position };
        }
    }
    return best;
}

function formatDateTime(value) {
    if (!value) return null;
    const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
    if (isNaN(date.getTime())) return null;

    const pad = (n, size = 2) => String(n).padStart(size, '0');
    return `DATE: ${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} TIME: ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`;
}

function normalizeTimeToMs(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value < 1e12 ? Math.floor(value * 1000) : Math.floor(value);
    }
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return null;
}

module.exports = { findClosestBeacon, formatDateTime, normalizeTimeToMs };