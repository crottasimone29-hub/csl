const { consolePrintHeader } = require('../utils/logger');

let sseClients = [];

function addClient(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    const clientId = Date.now();
    sseClients.push({ id: clientId, res });
    consolePrintHeader(`Dashboard connected. Total clients: ${sseClients.length}`, '#');

    // Heartbeat per mantenere viva la connessione dietro ai proxy
    const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(':heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients = sseClients.filter(c => c.id !== clientId);
        consolePrintHeader(`Dashboard disconnected. Total clients: ${sseClients.length}`, '#');
    });
}

function broadcastToDashboards(data) {
    if (sseClients.length > 0) {
        const payload = JSON.stringify({ timestamp: Date.now(), ...data });
        sseClients.forEach(client => client.res.write(`data: ${payload}\n\n`));
    }
}

function getClientCount() {
    return sseClients.length;
}

module.exports = { addClient, broadcastToDashboards, getClientCount };