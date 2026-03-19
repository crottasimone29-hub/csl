const path = require('path');
const { consolePrintHeader, consolePrintError } = require('../utils/logger');
const { normalizeTimeToMs } = require('../utils/helpers');

function getDeviceDecoder(decoderMap, deviceProfileId) {
    if (!decoderMap || !deviceProfileId || !decoderMap[deviceProfileId]) return null;
    
    const fileName = decoderMap[deviceProfileId].decoderFileName;
    const decoderFilePath = path.join(__dirname, '../decoders', fileName); 
    
    try {
        return require(decoderFilePath);
    } catch (err) {
        consolePrintError(err, `Impossibile caricare il decoder: ${fileName}`);
        return null;
    }
}

function processPayload(buffer, macToPosition = {}, decoderMap) {
    if (!buffer?.length || !decoderMap) return null;

    let uplink;
    try {
        uplink = JSON.parse(buffer.toString());
    } catch {
        return null;
    }

    const profileId = uplink?.deviceInfo?.deviceProfileId;
    if (!profileId) return null;

    const decoder = getDeviceDecoder(decoderMap, profileId);
    if (!decoder) {
        consolePrintHeader('Decoder not found, cannot process payload.', '@');
        return null;
    }

    consolePrintHeader(`Elaborazione: ${decoderMap[profileId].deviceName}`, '+');

    // 1. Enrich
    const enrichedUplink = (decoder.decodePayloadDataRaw && uplink.data) 
        ? { ...uplink, data: decoder.decodePayloadDataRaw(uplink.data, uplink.fPort) } 
        : uplink;

    // 2. Semantic
    let semantic = null;
    if (decoder.buildSemantic) {
        semantic = decoder.buildSemantic(enrichedUplink, macToPosition);
        if (semantic) semantic.time = normalizeTimeToMs(semantic.time) ?? Date.now();
    }

    // 3. Normalized (ex Formatted)
    let normalized = null;
    if (decoder.buildNormalized && semantic) {
        normalized = decoder.buildNormalized(semantic);
    }

    return { uplink, enriched: enrichedUplink, semantic, normalized };
}

module.exports = { processPayload };