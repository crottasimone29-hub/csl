require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createServer } = require('./api/server');
const { consolePrintHeader, consolePrintError } = require('./utils/logger');

const PORT = process.env.PORT || 3000;

function loadJsonSync(filePath, name) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        consolePrintHeader(`${name} loaded`, '@');
        return data;
    } catch (err) {
        consolePrintError(err, `Error loading ${name}`);
        return {};
    }
}

// 1. Carica i percorsi ai file di configurazione
const BEACON_MAP_PATH = path.join(__dirname, '../config/beacon_data.json');
const DECODER_MAP_PATH = path.join(__dirname, '../config/decoder_map.json');

const rawBeaconData = loadJsonSync(BEACON_MAP_PATH, 'Beacon Map');
const DECODER_MAP = loadJsonSync(DECODER_MAP_PATH, 'Decoder Map');

// Trasforma la rawBeaconData per ottimizzare la ricerca
const BEACON_MAP = {};
for (const [position, mac] of Object.entries(rawBeaconData)) {
    BEACON_MAP[mac.toUpperCase()] = position;
}

// 2. Inizializza e avvia il server
const app = createServer(BEACON_MAP, DECODER_MAP);

app.listen(PORT, () => {
    consolePrintHeader(`ChirpStack webhook server running on port ${PORT}`, '#');
    consolePrintHeader('BEACON MAP', '*');
    console.log(BEACON_MAP);
    consolePrintHeader('DECODER MAP', '*');
    console.log(DECODER_MAP);
    consolePrintHeader('WAITING FOR DATA', '*');
    consolePrintHeader('', '*');
});
