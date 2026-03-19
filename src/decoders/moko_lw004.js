const { normalizeTimeToMs, findClosestBeacon, formatDateTime } = require('../utils/helpers');

const getBitIntValue = (byte, pos) => (byte >> pos) & 1;
const getBitsIntValue = (byte, mask, shift = 0) => (byte & mask) >> shift;

function readUInt16BE(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
}

function decodeInt32BE(buf) {
    return buf?.length >= 4 ? buf.readInt32BE(0) / 1e7 : null;
}

function readSignedByte(value) {
    return value > 127 ? value - 256 : value;
}

function bufferToUInt32(buffer) {
    return buffer?.length >= 4 ? buffer.readUInt32BE(0) : null;
}

function formatTimezone(offset) {
    if (offset === undefined || offset === null) return null;
    const signed = readSignedByte(offset);
    return `UTC${signed >= 0 ? '+' : ''}${signed}`;
}

function parseBluetoothDevices(buffer) {
    const devices = [];
    const SIZE = 7;
    if (!buffer || buffer.length < SIZE) return devices;

    for (let i = 0; i + SIZE <= buffer.length; i += SIZE) {
        const mac = [...buffer.slice(i, i + 6)]
            .map(b => b.toString(16).padStart(2, "0"))
            .join(":")
            .toUpperCase();
        const rssi = buffer[i + 6] > 127 ? buffer[i + 6] - 256 : buffer[i + 6];
        devices.push({ mac, rssi });
    }
    return devices;
}

function getDeviceModeText(mode) {
    switch (mode) {
        case 1: return "Standby Mode";
        case 2: return "Timing Mode";
        case 3: return "Periodic Mode";
        case 4: return "Motion Mode - Stationary";
        case 5: return "Motion Mode - Start of Movement";
        case 6: return "Motion Mode - In Movement";
        case 7: return "Motion Mode - End of Movement";
        default: return `Unknown (${mode})`;
    }
}

function getAuxOpText(auxOp) {
    switch (auxOp) {
        case 0: return "No Auxiliary Operation";
        case 1: return "Downlink for Position";
        case 2: return "Man Down Detection";
        case 3: return "Alert Alarm";
        case 4: return "SOS Alarm";
        default: return `Unknown (${auxOp})`;
    }
}

function getEventTypeText(type) {
    switch (type) {
        case 0x00: return "Start of Movement";
        case 0x01: return "In Movement";
        case 0x02: return "End of Movement";
        case 0x03: return "SOS Alarm Start";
        case 0x04: return "SOS Alarm Exit";
        case 0x05: return "Alert Alarm Start";
        case 0x06: return "Alert Alarm Exit";
        case 0x07: return "Man Down Enter";
        case 0x08: return "Man Down Exit";
        default: return `Unknown (0x${type.toString(16).padStart(2, '0')})`;
    }
}

function getShutdownTypeText(type) {
    switch (type) {
        case 0: return "Bluetooth Command";
        case 1: return "LoRaWAN Downlink";
        case 2: return "Button Pressed";
        case 3: return "No Power (Battery Run Out)";
        default: return `Unknown (${type})`;
    }
}

function getFailureReasonText(reason, isGps = true) {
    if (isGps) {
        switch (reason) {
            case 1: return "Hardware Error";
            case 2: return "Interrupted by Downlink for Position";
            case 3: return "Interrupted by Man Down Detection";
            case 4: return "Interrupted by Alarm Function";
            case 5: return "GPS Positioning Timeout";
            case 6: return "GPS Positioning Time Too Short";
            case 7: return "Alert Alarm Report Interval Too Short";
            case 8: return "SOS Alarm Report Interval Too Short";
            case 9: return "GPS PDOP Limit Exceeded";
            case 10: return "Interrupted at End of Movement";
            case 11: return "Interrupted at Start of Movement";
            case 12: return "Other Reason";
            default: return `Unknown (${reason})`;
        }
    }
    switch (reason) {
        case 1: return "Hardware Error";
        case 2: return "Interrupted by Downlink for Position";
        case 3: return "Interrupted by Man Down Detection";
        case 4: return "Interrupted by Alarm Function";
        case 5: return "Bluetooth Positioning Timeout";
        case 6: return "Bluetooth Broadcasting in Progress";
        case 7: return "Interrupted at End of Movement";
        case 8: return "Interrupted at Start of Movement";
        default: return `Unknown (${reason})`;
    }
}

function getLowPowerPromptText(percent) {
    return `${percent}%`;
}

function decodePayloadDataRaw(encodedPayloadData, fPort) {
    const bytes = Buffer.from(encodedPayloadData, "base64");
    if (!bytes.length) return { error: "Empty payload data" };

    const base = {
        fPort,
        chargingBitRaw: getBitIntValue(bytes[0], 7),
        batteryLevelRaw: getBitsIntValue(bytes[0], 0x7F),
    };

    let decodedData = {};

    switch (fPort) {
        case 1:
            decodedData = {
                timezoneRaw: bytes[1],
                timestampRaw: bytes.slice(2, 6),
                eventTypeRaw: bytes[6],
            };
            break;
        case 2: {
            const deviceStatus = bytes[1];
            decodedData = {
                deviceModeRaw: getBitsIntValue(deviceStatus, 0xF0, 4),
                auxOpRaw: getBitsIntValue(deviceStatus, 0x0F),
                firmwareVerRaw: bytes.slice(2, 5),
                hardwareVerRaw: bytes.slice(5, 7),
                timezoneRaw: bytes[7],
            };
            break;
        }
        case 3: {
            const deviceStatus = bytes[1];
            decodedData = {
                deviceModeRaw: getBitsIntValue(deviceStatus, 0xF0, 4),
                auxOpRaw: getBitsIntValue(deviceStatus, 0x0F),
                timezoneRaw: bytes[2],
                timestampRaw: bytes.slice(3, 7),
                shutdownTypeRaw: bytes[7],
            };
            break;
        }
        case 4: {
            const deviceStatus = bytes[1];
            decodedData = {
                deviceModeRaw: getBitsIntValue(deviceStatus, 0xF0, 4),
                auxOpRaw: getBitsIntValue(deviceStatus, 0x0F),
                timezoneRaw: bytes[2],
                timestampRaw: bytes.slice(3, 7),
            };
            break;
        }
        case 5: {
            const deviceStatus = bytes[1];
            decodedData = {
                deviceModeRaw: getBitsIntValue(deviceStatus, 0xF0, 4),
                auxOpRaw: getBitsIntValue(deviceStatus, 0x0F),
                timezoneRaw: bytes[2],
                timestampRaw: bytes.slice(3, 7),
                lowPowerPromptRaw: bytes[7],
            };
            break;
        }
        case 6:
        case 10: {
            const statusAgeWord = (bytes[1] << 8) | bytes[2];
            const deviceModeRaw = (statusAgeWord >> 13) & 0x07;
            const auxOpRaw = (statusAgeWord >> 10) & 0x07;
            const ageRaw = statusAgeWord & 0x03FF;
            decodedData = {
                deviceModeRaw,
                auxOpRaw,
                ageRaw,
                longitudeRaw: bytes.slice(3, 7),
                latitudeRaw: bytes.slice(7, 11),
            };
            break;
        }
        case 7:
        case 11: {
            const deviceStatus = bytes[1];
            decodedData = {
                deviceModeRaw: getBitsIntValue(deviceStatus, 0xF0, 4),
                auxOpRaw: getBitsIntValue(deviceStatus, 0x0F),
                failureReasonRaw: bytes[2],
                failureDataRaw: bytes.slice(3, 7),
            };
            break;
        }
        case 8:
        case 12: {
            const deviceStatus = bytes[1];
            decodedData = {
                deviceModeRaw: getBitsIntValue(deviceStatus, 0xF0, 4),
                auxOpRaw: getBitsIntValue(deviceStatus, 0x0F),
                ageRaw: readUInt16BE(bytes, 2),
                bluetoothDataRaw: bytes.slice(4),
            };
            break;
        }
        case 9:
        case 13: {
            const deviceStatus = bytes[1];
            decodedData = {
                deviceModeRaw: getBitsIntValue(deviceStatus, 0xF0, 4),
                auxOpRaw: getBitsIntValue(deviceStatus, 0x0F),
                failureReasonRaw: bytes[2],
                bluetoothDataRaw: bytes.slice(3),
            };
            break;
        }
        default:
            return { ...base, error: `Unknown fPort: ${fPort}` };
    }

    return { ...base, ...decodedData };
}

function buildSemantic(enrichedUplink, macToPosition) {
    const d = enrichedUplink?.data;
    if (!d || d.error) return null;

    const semantic = {
        devEui: enrichedUplink.deviceInfo?.devEui,
        time: enrichedUplink.time,
        gateways: Array.isArray(enrichedUplink.rxInfo)
            ? enrichedUplink.rxInfo.map(info => info.gatewayId).filter(Boolean)
            : [],
        fPort: d.fPort,
        battery: d.batteryLevelRaw,
        isCharging: Boolean(d.chargingBitRaw),
    };

    if (d.deviceModeRaw !== undefined) {
        semantic.deviceModeCode = d.deviceModeRaw;
        semantic.deviceModeText = getDeviceModeText(d.deviceModeRaw);
    }
    if (d.auxOpRaw !== undefined) {
        semantic.auxOpCode = d.auxOpRaw;
        semantic.auxOpText = getAuxOpText(d.auxOpRaw);
    }

    switch (d.fPort) {
        case 1:
            semantic.payloadType = "Event";
            semantic.timestamp = bufferToUInt32(d.timestampRaw);
            semantic.timezone = formatTimezone(d.timezoneRaw);
            semantic.eventTypeCode = d.eventTypeRaw;
            semantic.eventTypeText = getEventTypeText(d.eventTypeRaw);
            break;
        case 2:
            semantic.payloadType = "Device Info";
            semantic.timezone = formatTimezone(d.timezoneRaw);
            semantic.firmwareVersion = d.firmwareVerRaw?.toString("hex") || null;
            semantic.hardwareVersion = d.hardwareVerRaw?.toString("hex") || null;
            break;
        case 3:
            semantic.payloadType = "Shutdown";
            semantic.timestamp = bufferToUInt32(d.timestampRaw);
            semantic.timezone = formatTimezone(d.timezoneRaw);
            semantic.shutdownTypeCode = d.shutdownTypeRaw;
            semantic.shutdownTypeText = getShutdownTypeText(d.shutdownTypeRaw);
            break;
        case 4:
            semantic.payloadType = "Heartbeat";
            semantic.timestamp = bufferToUInt32(d.timestampRaw);
            semantic.timezone = formatTimezone(d.timezoneRaw);
            break;
        case 5:
            semantic.payloadType = "Low Power";
            semantic.timestamp = bufferToUInt32(d.timestampRaw);
            semantic.timezone = formatTimezone(d.timezoneRaw);
            semantic.lowPowerPrompt = d.lowPowerPromptRaw;
            semantic.lowPowerPromptText = getLowPowerPromptText(d.lowPowerPromptRaw);
            break;
        case 6:
        case 10:
            semantic.payloadType = d.fPort === 6 ? "GPS Location (Working Mode)" : "GPS Location (Auxiliary)";
            semantic.age = d.ageRaw;
            semantic.location = {
                gps: {
                    latitude: decodeInt32BE(d.latitudeRaw),
                    longitude: decodeInt32BE(d.longitudeRaw),
                }
            };
            break;
        case 7:
        case 11:
            semantic.payloadType = d.fPort === 7 ? "GPS Failure (Working Mode)" : "GPS Failure (Auxiliary)";
            semantic.failureReasonCode = d.failureReasonRaw;
            semantic.failureReasonText = getFailureReasonText(d.failureReasonRaw, true);
            if (d.failureDataRaw) {
                semantic.gpsFailureData = {
                    cn0: d.failureDataRaw[0],
                    cn1: d.failureDataRaw[1],
                    cn2: d.failureDataRaw[2],
                    cn3: d.failureDataRaw[3],
                };
            }
            break;
        case 8:
        case 12:
            semantic.payloadType = d.fPort === 8 ? "Bluetooth Location (Working Mode)" : "Bluetooth Location (Auxiliary)";
            semantic.age = d.ageRaw;
            if (d.bluetoothDataRaw) {
                semantic.location = semantic.location || {};
                semantic.location.ble = parseBluetoothDevices(d.bluetoothDataRaw);
                if (macToPosition && semantic.location.ble?.length) {
                    semantic.closestBeacon = findClosestBeacon(semantic.location.ble, macToPosition);
                }
            }
            break;
        case 9:
        case 13:
            semantic.payloadType = d.fPort === 9 ? "Bluetooth Failure (Working Mode)" : "Bluetooth Failure (Auxiliary)";
            semantic.failureReasonCode = d.failureReasonRaw;
            semantic.failureReasonText = getFailureReasonText(d.failureReasonRaw, false);
            if (d.bluetoothDataRaw) {
                semantic.location = semantic.location || {};
                semantic.location.ble = parseBluetoothDevices(d.bluetoothDataRaw);
            }
            break;
    }

    return semantic;
}

function buildNormalized(semantic) {
    if (!semantic) return null;

    const normalized = {
        time: normalizeTimeToMs(semantic.time),
        deviceId: semantic.devEui,
        battery: semantic.battery,
        isCharging: semantic.isCharging,
        gateways: semantic.gateways,
        gps: null,
        ble: null,
    };

    if ((semantic.fPort === 6 || semantic.fPort === 10) && semantic.location?.gps) {
        normalized.gps = {
            latitude: semantic.location.gps.latitude,
            longitude: semantic.location.gps.longitude,
        };
    }

    if ((semantic.fPort === 8 || semantic.fPort === 12) && semantic.location?.ble) {
        normalized.ble = {
            mac: semantic.location.ble[0].mac,
            rssi: semantic.location.ble[0].rssi,
        };
    }

    return normalized;
}

module.exports = {
    decodePayloadDataRaw,
    buildSemantic,
    buildNormalized,
};