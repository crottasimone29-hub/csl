const { normalizeTimeToMs } = require("../utils/helpers");
const { consolePrintHeader } = require("../utils/logger");

const MANDOWN_TIMEOUT_MS = 600000; // 10 minuti
const SOS_TIMEOUT_MS = 600000;     // 10 minuti

const DEFAULT_STATE = {
    SOS: {
        canBeSent: false,
        isCurrentState: false,
        lastSent: null
    },
    ManDown: {
        canBeSent: false,
        isCurrentState: false,
        lastSent: null
    }
};

const deviceStatus = new Map();

/**
 * Elabora il pacchetto semantico e aggiorna lo stato del dispositivo nella Map
 */
function processDeviceEvent(deviceId, semantic) {
    // Filtra subito le porte non gestite
    if (semantic.fPort !== 5 && semantic.fPort !== 8 && semantic.fPort !== 9) return false;

    // 1. Recupera lo stato precedente o effettua un DEEP CLONE del default
    let currentState;
    if (deviceStatus.has(deviceId)) {
        currentState = deviceStatus.get(deviceId);
    } else {
        // Deep clone via JSON per evitare la condivisione dei riferimenti in memoria
        currentState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }

    const eventTimeMs = normalizeTimeToMs(semantic.time);

    // 2. Gestione fPort 5 (Eventi di Stato)
    if (semantic.fPort === 5) {
        const eventTypeCode = semantic.eventTypeCode;
        
        switch (eventTypeCode) {
            case 0x03:
                currentState.ManDown.canBeSent = true;
                currentState.ManDown.isCurrentState = true;
                currentState.ManDown.lastSent = eventTimeMs;
                break;
            case 0x04:
                currentState.ManDown.canBeSent = false;
                currentState.ManDown.isCurrentState = false;
                break; // Risolto il fall-through critico!
            case 0x05:
                currentState.SOS.canBeSent = true;
                currentState.SOS.isCurrentState = true;
                currentState.SOS.lastSent = eventTimeMs;
                break;
            case 0x06:
                currentState.SOS.canBeSent = false;
                currentState.SOS.isCurrentState = false;
                break;
        }
    }

    // 3. Gestione fPort 8 o 9 (Posizionamenti/GPS)
    if (semantic.fPort === 8 || semantic.fPort === 9) {
        const positioningTypeCode = semantic.positioningTypeCode;

        switch (positioningTypeCode) {
            case 1:
                currentState.ManDown.canBeSent = false;
                currentState.ManDown.isCurrentState = true;
                currentState.ManDown.lastSent = eventTimeMs;
                break;
            case 4:
                currentState.SOS.canBeSent = false;
                currentState.SOS.isCurrentState = true;
                currentState.SOS.lastSent = eventTimeMs;
                break;
        }
    }

    // 4. Controllo Timeout (Separato per SOS e ManDown)
    const now = Date.now();

    if (currentState.SOS.lastSent && (now - currentState.SOS.lastSent) > SOS_TIMEOUT_MS) {
        currentState.SOS.canBeSent = false;
        currentState.SOS.isCurrentState = false;
    }

    if (currentState.ManDown.lastSent && (now - currentState.ManDown.lastSent) > MANDOWN_TIMEOUT_MS) {
        currentState.ManDown.canBeSent = false;
        currentState.ManDown.isCurrentState = false;
    }

    // 5. Salva lo stato aggiornato nella Map
    deviceStatus.set(deviceId, currentState);

    // --- LOG DI DEBUG INSERITO QUI ---
    console.log(`\n============== [DEBUG] STATE UPDATE ==============`);
    console.log(`Device ID: ${deviceId}`);
    console.log(`FPort:     ${semantic.fPort}`);
    console.log(`Current State:\n${JSON.stringify(currentState, null, 2)}`);
    console.log(`==================================================\n`);

    return shouldSendAlarm(currentState);
}

/**
 * Controlla se l'allarme deve essere inviato per un determinato stato dispositivo
 * Ridenominato il parametro in 'statusObj' per evitare conflitti con la Map globale 'deviceStatus'
 */
function shouldSendAlarm(statusObj) {
    if (!statusObj) return false;
    
    const sosTrigger = statusObj.SOS.canBeSent && statusObj.SOS.isCurrentState;
    const manDownTrigger = statusObj.ManDown.canBeSent && statusObj.ManDown.isCurrentState;
    
    return sosTrigger || manDownTrigger;
}


module.exports = {
    processDeviceEvent,
};