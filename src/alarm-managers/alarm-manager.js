const fs = require('fs');
const path = require('path');

const mokoLw010 = require('./moko-lw010');

const MANAGER_MAPPING = {
    "moko_lw010.js": mokoLw010
};

const CONFIG_PATH = path.join(__dirname, '../../config/decoder_map.json');

function manageAlarm(semantic) {
    if (!semantic?.deviceId) return false;

    try {
        const decoderMap = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        const profileId = semantic.deviceProfileId || semantic.deviceProfileID;
        
        const profile = decoderMap[profileId];
        if (!profile) return false;

        const targetManager = MANAGER_MAPPING[profile.decoderFileName];
        if (!targetManager) return false;

        return targetManager.processDeviceEvent(semantic.deviceId, semantic);
    } catch (error) {
        console.error("Alarm Gateway Error:", error.message);
        return false;
    }
}

module.exports = { 
    manageAlarm 
};