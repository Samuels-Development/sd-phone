// Clause 2: the 24 byte binary media header. Every multi-byte integer is big endian; the Buffer
// helpers used here are the BE variants for that reason and no little endian read exists in this
// file by design.

const { FLAG_MASK, KIND, MAGIC, SDMR_HEADER_BYTES, VERSION } = require('./protocol.js');

const KIND_OK = new Set([KIND.INIT, KIND.KEY, KIND.DELTA, KIND.JPEG]);

function isSelfContained(kind) {
    return kind === KIND.INIT || kind === KIND.KEY || kind === KIND.JPEG;
}

// Returns { ok: true, header } or { ok: false, reason } so the caller can pick the close code.
function decodeFrame(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < SDMR_HEADER_BYTES) return { ok: false, reason: 'short' };
    if (buf[0] !== MAGIC) return { ok: false, reason: 'magic' };
    if (buf[1] !== VERSION) return { ok: false, reason: 'version' };

    const kind = buf[2];
    if (!KIND_OK.has(kind)) return { ok: false, reason: 'kind' };

    return {
        ok: true,
        header: {
            kind,
            flags: buf[3] & FLAG_MASK,
            sid: buf.readUInt32BE(4),
            gen: buf.readUInt32BE(8),
            seq: buf.readUInt32BE(12),
            timestampUs: Number(buf.readBigUInt64BE(16)),
        },
    };
}

function encodeHeader(kind, flags, sid, gen, seq, timestampUs) {
    const head = Buffer.allocUnsafe(SDMR_HEADER_BYTES);
    head[0] = MAGIC;
    head[1] = VERSION;
    head[2] = kind & 0xff;
    head[3] = flags & FLAG_MASK;
    head.writeUInt32BE(sid >>> 0, 4);
    head.writeUInt32BE(gen >>> 0, 8);
    head.writeUInt32BE(seq >>> 0, 12);
    const us = Number.isFinite(timestampUs) && timestampUs > 0 ? Math.floor(timestampUs) : 0;
    head.writeBigUInt64BE(BigInt(us), 16);
    return head;
}

function encodeFrame(kind, flags, sid, gen, seq, timestampUs, payload) {
    const body = payload ?? Buffer.alloc(0);
    return Buffer.concat([encodeHeader(kind, flags, sid, gen, seq, timestampUs), body], SDMR_HEADER_BYTES + body.length);
}

module.exports = {
    isSelfContained,
    decodeFrame,
    encodeHeader,
    encodeFrame,
};
