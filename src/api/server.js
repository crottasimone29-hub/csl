const express = require('express');
const path = require('path');
const fs = require('fs');
const sseManager = require('./sse_manager');
const { processPayload } = require('../core/pipeline');
const { sendToBCare } = require('../core/bcare_client');
const { consolePrintHeader, consolePrintError } = require('../utils/logger');
const { formatDateTime } = require('../utils/helpers');
const { processDeviceEvent } = require('../alarm-managers/AM_moko_lw010');
const alarmGateway = require('./src/alarm-managers/alarm-manager');

function createServer(beaconMap, decoderMap) {
    const app = express();
    app.use(express.json({ limit: '2mb' }));

    app.use(express.static(path.join(__dirname, '../../public')));

    const DASHBOARD_PATH = path.join(__dirname, '../../public/dashboard.html');

    app.get('/', (req, res) => {
        if (fs.existsSync(DASHBOARD_PATH)) {
            res.sendFile(DASHBOARD_PATH);
        } else {
            res.status(404).send('<h2>Dashboard non trovata in /public</h2>');
        }
    });

    app.get('/events', sseManager.addClient);

    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'OK', uptime: process.uptime(), clients: sseManager.getClientCount() });
    });

    app.post('/', async (req, res) => {
        try {
            const payload = req.body;
            if (!payload || Object.keys(payload).length === 0) return res.status(400).send('Empty payload');
            
            if (req.query.event !== 'up') {
                return res.status(200).send('Ignored');
            }

            const buffer = Buffer.from(JSON.stringify(payload));
            const result = processPayload(buffer, beaconMap, decoderMap);
            
            if (!result) return res.status(400).send('Invalid payload');

            // 1. Log del risultato
            consolePrintHeader(`${formatDateTime(Date.now())}`, '*');
            console.dir(result.semantic, { depth: null });
            consolePrintHeader(`${formatDateTime(Date.now())}`, '*');
            console.dir(result.normalized, { depth: null });            
            consolePrintHeader('END', '*');

            // 2. Invio alla Dashboard
            sseManager.broadcastToDashboards(result);

            const isAlarmActive = alarmGateway.manageAlarm(result.semantic);

            if (isAlarmActive) {
                // 3. Invio asincrono a BCare passando il nuovo oggetto "normalized"
                sendToBCare(result.normalized).catch(err => consolePrintError(err));
            }

            res.status(200).send('OK');
        } catch (err) {
            consolePrintError(err, 'Server Error in POST /');
            res.status(500).send('Server error');
        }
    });

    return app;
}

module.exports = { createServer };