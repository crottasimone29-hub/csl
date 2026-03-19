const axios = require('axios');
const { consolePrintHeader, consolePrintError } = require('../utils/logger');

const BCARE_ENABLE = process.env.BCARE_ENABLE === 'true';
const BCARE_THROTTLE_MS = parseInt(process.env.BCARE_THROTTLE_MS || '25000');

let timeOfLastDataSentToBCare = null;

function formatForBCare(normalized) {
    if (!normalized) return null;

    const bcareFormat = {
        deviceId: normalized.deviceId,
        timestamp: normalized.time,
        battery: normalized.battery,
        isCharging: normalized.isCharging,
        gps: null,
        bluetoothBeacon: null,
    };

    if (normalized.gps) {
        bcareFormat.gps = {
            latitude: normalized.gps.latitude,
            longitude: normalized.gps.longitude,
        }
    }

    if (normalized.ble) {
        bcareFormat.bluetoothBeacon = {
            mac: normalized.ble.mac,
            rssi: normalized.ble.rssi,
        }
    }

    return bcareFormat;
}

async function sendToBCare(normalizedData) {
    if (!BCARE_ENABLE || !normalizedData) return null;

    if (timeOfLastDataSentToBCare && (Date.now() - timeOfLastDataSentToBCare) < BCARE_THROTTLE_MS) {
        const remainingSec = Math.ceil((BCARE_THROTTLE_MS - (Date.now() - timeOfLastDataSentToBCare)) / 1000);
        consolePrintHeader(`BCare throttle active: wait ${remainingSec}s`, '#');
        return null;
    }

    const bcareLoraData = formatForBCare(normalizedData);

    const payload = {
        tipo: 5, 
        sms: null, 
        contatto: null, 
        modbus: null, 
        seriale: null, 
        orologio: null,
        lora: bcareLoraData,
        id: 0, 
        modalita: 0
    };

    consolePrintHeader("SENDING TO BCARE", "=");
    console.dir(payload, { depth: null });
    consolePrintHeader("END", "=");

    const url = `https://bcare.awswitch.com/api/v4?${encodeURIComponent(JSON.stringify(payload))}`;

    try {
        consolePrintHeader('Invio dati a BCare', '#');
        const response = await axios.post(url, null, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
        
        timeOfLastDataSentToBCare = Date.now();
        consolePrintHeader('Risposta da BCare', '#');
        console.log(JSON.stringify(response.data, null, 2));
        
        return response.data;
    } catch (err) {
        consolePrintError(err.response?.data || err.message, 'Errore invio a BCare');
        return null;
    }
}

module.exports = { sendToBCare };
