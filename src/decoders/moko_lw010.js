const { normalizeTimeToMs, findClosestBeacon, formatDateTime } = require('../utils/helpers');

const getBitIntValue = (byte, pos) => (byte >> pos) & 1;
const getBitsIntValue = (byte, mask, shift = 0) => (byte & mask) >> shift;

function readUInt32BE(bytes, offset) {
    return (
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
    );
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

        const rssi = buffer[i + 6] > 127
            ? buffer[i + 6] - 256
            : buffer[i + 6];

        devices.push({ mac, rssi });
    }

    return devices;
}

function getWorkingModeText(mode) {
    switch (mode) {
        case 0: return "Standby Mode";
        case 1: return "Timing Mode";
        case 2: return "Periodic Mode";
        case 3: return "Motion Mode - Stationary";
        case 4: return "Motion Mode - Start of Movement";
        case 5: return "Motion Mode - Moving";
        case 6: return "Motion Mode - End of Movement";
        case 7: return "Timing + Periodic Mode";
        default: return `Unknown (${mode})`;
    }
}

function getDeviceStatusText(status) {
    switch (status) {
        case 0: return "No AuxOp";
        case 1: return "Man Down";
        case 2: return "Downlink for Positioning";
        case 3: return "Alert Alarm";
        case 4: return "SOS Alarm";
        default: return `Unknown (${status})`;
    }
}

function getShutdownTypeText(type) {
    switch (type) {
        case 0: return "Bluetooth Command";
        case 1: return "LoRaWAN Downlink";
        case 2: return "Button Pressed";
        case 3: return "No Power";
        default: return `Unknown (${type})`;
    }
}

function getLowPowerPercentageText(percentage) {
    switch (percentage) {
        case 0: return "10%";
        case 1: return "20%";
        case 2: return "30%";
        case 3: return "40%";
        case 4: return "50%";
        case 5: return "60%";
        default: return `Unknown (${percentage})`;
    }
}

function getEventTypeText(type) {
    switch (type) {
        case 0x00: return "Movement Start";
        case 0x01: return "In Movement";
        case 0x02: return "Movement End";
        case 0x03: return "Man Down Start";
        case 0x04: return "Man Down End";
        case 0x05: return "SOS Start";
        case 0x06: return "SOS End";
        case 0x07: return "Alert Alarm Start";
        case 0x08: return "Alert Alarm End";
        case 0x0B: return "Downlink for Positioning";
        case 0x0C: return "High Temperature";
        case 0x0D: return "Low Temperature";
        case 0x0E: return "High Light Intensity";
        default: return `Unknown (0x${type.toString(16).padStart(2, '0')})`;
    }
}

function getPositioningTypeText(type) {
    switch (type) {
        case 0: return "By Working Mode";
        case 1: return "By Man Down";
        case 2: return "By Downlink for Positioning";
        case 3: return "By Alert";
        case 4: return "By SOS";
        default: return `Unknown (${type})`;
    }
}

function getPositioningSuccessTypeText(type) {
    switch (type) {
        case 1: return "Bluetooth OK";
        case 3: return "GPS OK";
        default: return `Unknown (${type})`;
    }
}

function getFailureReasonText(reason) {
    switch (reason) {
        case 3: return "BLE Positioning time is set too short";
        case 4: return "BLE Timeout Reached";
        case 6: return "GPS Positioning time is set too short";
        case 7: return "GPS Timeout Reached";
        case 10: return "GPS aiding positioning Timeout";
        case 11: return "Positioning interrupted by End of Movement";
        case 12: return "Positioning interrupted by Start of Movement";
        case 13: return "Positioning interrupted by Man Down Status";
        case 14: return "Positioning interrupted by Downlink for Positioning";
        case 15: return "Positioning interrupted by Alarm";
        default: return `Unknown (${reason})`;
    }
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
                temperatureRaw: bytes[1],
                fwVersionMajorRaw: getBitsIntValue(bytes[2], 0xC0, 6),
                fwVersionSubRaw: getBitsIntValue(bytes[2], 0x30, 4),
                fwVersionPatchRaw: getBitsIntValue(bytes[2], 0x0F),
                hwVersionMajorRaw: getBitsIntValue(bytes[3], 0xF0, 4),
                hwVersionPatchRaw: getBitsIntValue(bytes[3], 0x0F),
                workingModeRaw: bytes[4],
                deviceStatusRaw: bytes[5],
                lightIntensityRaw: (bytes[6] << 8) | bytes[7],
            };
            break;

        case 2:
            decodedData = {
                temperatureRaw: bytes[1],
                timestampRaw: bytes.slice(2, 6),
                timezoneRaw: bytes[6],
                workingModeRaw: bytes[7],
                deviceStatusRaw: bytes[8],
                shutdownTypeRaw: bytes[9],
                lightIntensityRaw: (bytes[10] << 8) | bytes[11],
            };
            break;

        case 3:
            decodedData = {
                temperatureRaw: bytes[1],
                timestampRaw: bytes.slice(2, 6),
                timezoneRaw: bytes[6],
                workingModeRaw: bytes[7],
                deviceStatusRaw: bytes[8],
                lightIntensityRaw: (bytes[9] << 8) | bytes[10],
            };
            break;

        case 4:
            decodedData = {
                temperatureRaw: bytes[1],
                timestampRaw: bytes.slice(2, 6),
                timezoneRaw: bytes[6],
                workingModeRaw: bytes[7],
                deviceStatusRaw: bytes[8],
                lowPowerPercentageRaw: bytes[9],
                lightIntensityRaw: (bytes[10] << 8) | bytes[11],
            };
            break;

        case 5:
            decodedData = {
                timestampRaw: bytes.slice(1, 5),
                timezoneRaw: bytes[5],
                eventTypeRaw: bytes[6],
                temperatureRaw: bytes[7],
                unknownByte8Raw: bytes[8],
                lightIntensityRaw: (bytes[9] << 8) | bytes[10],
            };
            break;

        case 6:
            decodedData = {
                positioningTypeRaw: getBitsIntValue(bytes[0], 0xF0, 4),
                ageRaw: (getBitsIntValue(bytes[0], 0x0F) << 8) | bytes[1],
                latitudeRaw: bytes.slice(2, 6),
                longitudeRaw: bytes.slice(6, 10),
                pdopRaw: bytes[10],
            };
            break;

        case 8:
            {
                const ageRaw = (bytes[1] << 8) | bytes[2];
                const positioningTypeRaw = getBitsIntValue(bytes[3], 0xF0, 4);
                const positioningSuccessTypeRaw = getBitsIntValue(bytes[3], 0x0F);
                const workingModeRaw = getBitsIntValue(bytes[4], 0xF0, 4);
                const deviceStatusRaw = getBitsIntValue(bytes[4], 0x0F);
                const locationDataLength = bytes[5];

                let bleDataRaw, gpsDataRaw;
                let offset = 6;

                if (positioningSuccessTypeRaw === 1 && offset + locationDataLength <= bytes.length) {
                    bleDataRaw = bytes.slice(offset, offset + locationDataLength);
                    offset += locationDataLength;
                } else if (positioningSuccessTypeRaw === 3 && offset + 9 <= bytes.length) {
                    gpsDataRaw = bytes.slice(offset, offset + 9);
                    offset += 9;
                }

                let temperatureRaw = null;
                if (offset < bytes.length) {
                    temperatureRaw = bytes[offset];
                    offset += 1;
                }

                let lightIntensityRaw = null;
                if (offset + 1 < bytes.length) {
                    lightIntensityRaw = (bytes[offset] << 8) | bytes[offset + 1];
                    offset += 2;
                }

                let timestampRaw = null;
                if (offset + 3 < bytes.length) {
                    timestampRaw = bytes.slice(offset, offset + 4);
                }

                decodedData = {
                    ageRaw,
                    positioningTypeRaw,
                    positioningSuccessTypeRaw,
                    workingModeRaw,
                    deviceStatusRaw,
                    locationDataLengthRaw: locationDataLength,
                    bleDataRaw,
                    gpsDataRaw,
                    temperatureRaw,
                    lightIntensityRaw,
                    timestampRaw,
                };
            }
            break;

        case 9:
            {
                const positioningTypeRaw = bytes[1];
                const workingModeRaw = bytes[2];
                const deviceStatusRaw = bytes[3];
                const failureReasonRaw = bytes[4];
                const locationFailureDataLength = bytes[5];

                let bleDataRaw, gpsFailureDataRaw;
                let offset = 6;

                if ((failureReasonRaw === 3 || failureReasonRaw === 4) && offset + locationFailureDataLength <= bytes.length) {
                    bleDataRaw = bytes.slice(offset, offset + locationFailureDataLength);
                } else if ((failureReasonRaw === 6 || failureReasonRaw === 7 || failureReasonRaw === 10) && offset + 5 <= bytes.length) {
                    gpsFailureDataRaw = bytes.slice(offset, offset + 5);
                }

                decodedData = {
                    positioningTypeRaw,
                    workingModeRaw,
                    deviceStatusRaw,
                    failureReasonRaw,
                    locationFailureDataLengthRaw: locationFailureDataLength,
                    bleDataRaw,
                    gpsFailureDataRaw,
                };
            }
            break;

        case 11:
            decodedData = {
                temperatureRaw: bytes[1],
                timestampRaw: bytes.slice(2, 6),
                timezoneRaw: bytes[6],
                workingModeRaw: bytes[7],
                deviceStatusRaw: bytes[8],
                vibrationTimesRaw: bytes[9],
                lightIntensityRaw: (bytes[10] << 8) | bytes[11],
            };
            break;

        case 12:
            decodedData = {
                deviceWorkingTimeRaw: bytes.slice(1, 5),
                bluetoothBroadcastTimesRaw: bytes.slice(5, 9),
                sensorWakeupTimeRaw: bytes.slice(9, 13),
                blePositioningTimeRaw: bytes.slice(13, 17),
                gpsPositioningTimeRaw: bytes.slice(17, 21),
                lorawanUplinkTimesRaw: bytes.slice(21, 25),
                lorawanPowerConsumptionRaw: bytes.slice(25, 29),
                totalPowerConsumptionRaw: bytes.slice(29, 33),
                stationaryPositioningReportTimesRaw: bytes.slice(33, 37),
                movementPositioningReportTimesRaw: bytes.slice(37, 41),
                greenLedWorkingTimeRaw: bytes.slice(41, 45),
                orangeLedWorkingTimeRaw: bytes.slice(45, 49),
                blueLedWorkingTimeRaw: bytes.slice(49, 53),
            };
            break;

        default:
            return {
                ...base,
                error: `Unknown fPort: ${fPort}`
            };
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

    if (d.workingModeRaw !== undefined) {
        semantic.workingModeCode = d.workingModeRaw;
        semantic.workingModeText = getWorkingModeText(d.workingModeRaw);
    }
    if (d.deviceStatusRaw !== undefined) {
        semantic.deviceStatusCode = d.deviceStatusRaw;
        semantic.deviceStatusText = getDeviceStatusText(d.deviceStatusRaw);
    }
    if (d.temperatureRaw !== undefined) {
        semantic.temperature = d.temperatureRaw === 0x80 ? null : readSignedByte(d.temperatureRaw);
    }
    if (d.lightIntensityRaw !== undefined) {
        semantic.lightIntensity = d.lightIntensityRaw === 0xFFFF ? null : d.lightIntensityRaw;
    }

    switch (d.fPort) {
        case 1:
            semantic.payloadType = "Device Info";
            semantic.firmwareVersion = `${d.fwVersionMajorRaw}.${d.fwVersionSubRaw}.${d.fwVersionPatchRaw}`;
            semantic.hardwareVersion = `${d.hwVersionMajorRaw}.${d.hwVersionPatchRaw}`;
            break;

        case 2:
            semantic.payloadType = "Shutdown";
            semantic.timestamp = bufferToUInt32(d.timestampRaw);
            semantic.timezone = formatTimezone(d.timezoneRaw);
            semantic.shutdownTypeText = getShutdownTypeText(d.shutdownTypeRaw);
            semantic.shutdownTypeCode = d.shutdownTypeRaw;
            break;

        case 3:
            semantic.payloadType = "Heartbeat";
            semantic.timestamp = bufferToUInt32(d.timestampRaw);
            semantic.timezone = formatTimezone(d.timezoneRaw);
            break;

        case 4:
            semantic.payloadType = "Low Power";
            semantic.timestamp = bufferToUInt32(d.timestampRaw);
            semantic.timezone = formatTimezone(d.timezoneRaw);
            semantic.lowPowerPercentage = getLowPowerPercentageText(d.lowPowerPercentageRaw);
            semantic.lowPowerPercentageCode = d.lowPowerPercentageRaw;
            break;

        case 5:
            semantic.payloadType = "Event";
            semantic.timestamp = bufferToUInt32(d.timestampRaw);
            semantic.timezone = formatTimezone(d.timezoneRaw);
            semantic.eventTypeText = getEventTypeText(d.eventTypeRaw);
            semantic.eventTypeCode = d.eventTypeRaw;
            break;

        case 6:
            semantic.payloadType = "GPS Extreme";
            semantic.positioningTypeText = getPositioningTypeText(d.positioningTypeRaw);
            semantic.positioningTypeCode = d.positioningTypeRaw;
            semantic.age = d.ageRaw;
            semantic.location = {
                gps: {
                    latitude: decodeInt32BE(d.latitudeRaw),
                    longitude: decodeInt32BE(d.longitudeRaw),
                    pdop: d.pdopRaw / 10
                }
            };
            break;

        case 8:
            semantic.payloadType = "Location";
            semantic.age = d.ageRaw;
            semantic.positioningTypeText = getPositioningTypeText(d.positioningTypeRaw);
            semantic.positioningTypeCode = d.positioningTypeRaw;
            semantic.positioningSuccessTypeText = getPositioningSuccessTypeText(d.positioningSuccessTypeRaw);
            semantic.positioningSuccessTypeCode = d.positioningSuccessTypeRaw;

            if (d.bleDataRaw) {
                semantic.location = semantic.location || {};
                semantic.location.ble = parseBluetoothDevices(d.bleDataRaw);
                if (macToPosition && semantic.location.ble?.length) {
                    semantic.closestBeacon = findClosestBeacon(semantic.location.ble, macToPosition);
                }
            } else if (d.gpsDataRaw) {
                semantic.location = semantic.location || {};
                semantic.location.gps = {
                    latitude: decodeInt32BE(d.gpsDataRaw.slice(0, 4)),
                    longitude: decodeInt32BE(d.gpsDataRaw.slice(4, 8)),
                    pdop: d.gpsDataRaw[8] / 10
                };
            }

            if (d.timestampRaw) {
                semantic.timestamp = bufferToUInt32(d.timestampRaw);
            }
            break;

        case 9:
            semantic.payloadType = "Location Failure";
            semantic.positioningTypeText = getPositioningTypeText(d.positioningTypeRaw);
            semantic.positioningTypeCode = d.positioningTypeRaw;
            semantic.failureReasonText = getFailureReasonText(d.failureReasonRaw);
            semantic.failureReasonCode = d.failureReasonRaw;

            if (d.bleDataRaw) {
                semantic.location = semantic.location || {};
                semantic.location.ble = parseBluetoothDevices(d.bleDataRaw);
            } else if (d.gpsFailureDataRaw) {
                semantic.gpsFailure = {
                    pdop: d.gpsFailureDataRaw[0] / 10,
                    cn0: d.gpsFailureDataRaw[1],
                    cn1: d.gpsFailureDataRaw[2],
                    cn2: d.gpsFailureDataRaw[3],
                    cn3: d.gpsFailureDataRaw[4]
                };
            }
            break;

        case 11:
            semantic.payloadType = "Vibration";
            semantic.timestamp = bufferToUInt32(d.timestampRaw);
            semantic.timezone = formatTimezone(d.timezoneRaw);
            semantic.vibrationTimes = d.vibrationTimesRaw;
            break;

        case 12:
            semantic.payloadType = "Power Consumption";
            semantic.deviceWorkingTime = readUInt32BE(d.deviceWorkingTimeRaw, 0);
            semantic.bluetoothBroadcastTimes = readUInt32BE(d.bluetoothBroadcastTimesRaw, 0);
            semantic.sensorWakeupTime = readUInt32BE(d.sensorWakeupTimeRaw, 0);
            semantic.blePositioningTime = readUInt32BE(d.blePositioningTimeRaw, 0);
            semantic.gpsPositioningTime = readUInt32BE(d.gpsPositioningTimeRaw, 0);
            semantic.lorawanUplinkTimes = readUInt32BE(d.lorawanUplinkTimesRaw, 0);
            semantic.lorawanPowerConsumption = readUInt32BE(d.lorawanPowerConsumptionRaw, 0);
            semantic.totalPowerConsumption = readUInt32BE(d.totalPowerConsumptionRaw, 0);
            semantic.stationaryPositioningReportTimes = readUInt32BE(d.stationaryPositioningReportTimesRaw, 0);
            semantic.movementPositioningReportTimes = readUInt32BE(d.movementPositioningReportTimesRaw, 0);
            semantic.greenLedWorkingTime = readUInt32BE(d.greenLedWorkingTimeRaw, 0);
            semantic.orangeLedWorkingTime = readUInt32BE(d.orangeLedWorkingTimeRaw, 0);
            semantic.blueLedWorkingTime = readUInt32BE(d.blueLedWorkingTimeRaw, 0);
            break;
    }

    return semantic;
}

function buildNormalized(semantic) {
    if (!semantic) return null;
    if (![6, 8, 9].includes(semantic.fPort)) return null;

    const normalized = {
        time: normalizeTimeToMs(semantic.time),
        battery: semantic.battery,
        isCharging: semantic.isCharging,
        deviceId: semantic.devEui,
        deviceProfileId: semantic.deviceProfileId,
        deviceName: semantic.deviceName,
        decoderFileName: semantic.decoderFileName,
        fPort: semantic.fPort,
        payloadType: semantic.payloadType,
        positioningTypeCode: semantic.positioningTypeCode,
        gateways: semantic.gateways,
        gps: null,
        ble: null,
    };

    if (semantic.location) {
        if (semantic.location.gps) {
            normalized.gps = {
                latitude: semantic.location.gps.latitude,
                longitude: semantic.location.gps.longitude,            
            };
        }
        if (semantic.location.ble && semantic.location.ble.length > 0) {
            normalized.ble = {
                mac: semantic.location.ble[0].mac,
                rssi: semantic.location.ble[0].rssi,
            };
        }
    }

    return normalized;
}

module.exports = {
    decodePayloadDataRaw,
    buildSemantic,
    buildNormalized,
};