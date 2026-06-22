const LW010_CT_DECODER_FILE = 'moko_lw010.js';
const MAN_DOWN_TIMEOUT_MS = parseInt(process.env.MAN_DOWN_TIMEOUT_MS || process.env.BCARE_THROTTLE || '30000', 10);

const deviceStates = new Map();

function isLW010CTSource(source) {
    return source?.decoderFileName === LW010_CT_DECODER_FILE;
}

function getSemanticDeviceId(semantic) {
    return semantic?.devEui ?? semantic?.deviceId ?? null;
}

function getDeviceState(deviceId) {
    // Each device keeps its own alarm cycle so one LW010-CT cannot block another.
    if (!deviceStates.has(deviceId)) {
        deviceStates.set(deviceId, {
            manDown: {
                active: false,
                startedAt: null,
                lastHeartbeatAt: null,
                sentDuringCycle: false,
            },
            sos: {
                active: false,
                startedAt: null,
                sentDuringCycle: false,
            },
        });
    }

    return deviceStates.get(deviceId);
}

function clearAlarmState(alarmState) {
    // Clearing ends the current cycle: the next valid alarm start may send again.
    alarmState.active = false;
    alarmState.startedAt = null;
    alarmState.sentDuringCycle = false;
    if ('lastHeartbeatAt' in alarmState) {
        alarmState.lastHeartbeatAt = null;
    }
}

function activateAlarm(alarmState, timestamp) {
    alarmState.active = true;
    alarmState.startedAt = timestamp;
}

function expireManDownIfNeeded(deviceState, timestamp) {
    if (!deviceState.manDown.active) return;

    // Man Down has no explicit end packet, so the cycle closes when heartbeats stop.
    const referenceTime = deviceState.manDown.lastHeartbeatAt ?? deviceState.manDown.startedAt;
    if (!referenceTime) return;

    if ((timestamp - referenceTime) > MAN_DOWN_TIMEOUT_MS) {
        clearAlarmState(deviceState.manDown);
    }
}

function updateFromSemantic(semantic) {
    const deviceId = getSemanticDeviceId(semantic);
    if (!deviceId || !isLW010CTSource(semantic)) return;

    const timestamp = semantic.time ?? Date.now();
    const deviceState = getDeviceState(deviceId);

    // Expire stale Man Down cycles before processing the current event.
    expireManDownIfNeeded(deviceState, timestamp);

    if (semantic.payloadType !== 'Event') return;

    switch (semantic.eventTypeCode) {
        case 0x03:
            // Start a new Man Down cycle only once; repeated starts do not reopen it.
            if (!deviceState.manDown.active) {
                activateAlarm(deviceState.manDown, timestamp);
            }
            break;
        case 0x04:
            // Heartbeats extend the current Man Down cycle and keep it alive.
            if (deviceState.manDown.active) {
                deviceState.manDown.lastHeartbeatAt = timestamp;
            }
            break;
        case 0x05:
            // SOS is independent from Man Down and uses its own cycle.
            if (!deviceState.sos.active) {
                activateAlarm(deviceState.sos, timestamp);
            }
            break;
        case 0x06:
            // SOS end closes only the SOS cycle; it must not affect Man Down.
            clearAlarmState(deviceState.sos);
            break;
    }
}

function getAlarmTypeForPacket(normalized) {
    switch (normalized?.positioningTypeCode) {
        case 1:
            return 'manDown';
        case 4:
            return 'sos';
        default:
            return null;
    }
}

function shouldSendPacket(normalized) {
    if (!normalized?.deviceId || !isLW010CTSource(normalized)) return true;

    const timestamp = normalized.time ?? Date.now();
    const deviceState = getDeviceState(normalized.deviceId);

    // Packet decisions also honor cycle expiry so stale alarms do not stay locked forever.
    expireManDownIfNeeded(deviceState, timestamp);

    const alarmType = getAlarmTypeForPacket(normalized);
    if (!alarmType) return true;

    const alarmState = deviceState[alarmType];

    if (!alarmState.active) {
        // First positioning packet after a start opens the send window for this cycle.
        activateAlarm(alarmState, timestamp);
        alarmState.sentDuringCycle = true;
        return true;
    }

    // Any additional packet in the same cycle is suppressed until an end or timeout.
    if (alarmState.sentDuringCycle) return false;

    alarmState.sentDuringCycle = true;
    return true;
}

module.exports = {
    updateFromSemantic,
    shouldSendPacket,
};