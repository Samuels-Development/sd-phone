// A minimal RFC 6455 server endpoint. The relay ships with no runtime dependencies so a server
// owner can drop the folder on a box and run `node index.js`, so the handshake, the frame codec and
// the close handling live here rather than in a library. Only what SDMR/1 needs is implemented:
// text frames, binary frames, ping, pong, close and fragmentation. No extensions are negotiated,
// which is deliberate (the payloads are already compressed media).

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OPCODE = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

const WS_PROTOCOL_ERROR = 1002;
const COMPACT_AT = 1 << 16;
const CLOSE_LINGER_MS = 3000;

function computeAccept(key) {
    return crypto.createHash('sha1').update(`${key}${GUID}`).digest('base64');
}

// Writes the 101 response. Returns false when the request is not a usable websocket upgrade.
function acceptUpgrade(req, socket, { subprotocol } = {}) {
    const key = req.headers['sec-websocket-key'];
    const version = String(req.headers['sec-websocket-version'] ?? '');
    if (typeof key !== 'string' || key === '' || version !== '13') return false;

    const lines = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${computeAccept(key)}`,
    ];
    if (subprotocol) lines.push(`Sec-WebSocket-Protocol: ${subprotocol}`);
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    return true;
}

function offersSubprotocol(req, name) {
    const raw = req.headers['sec-websocket-protocol'];
    if (typeof raw !== 'string') return false;
    return raw.split(',').some((part) => part.trim() === name);
}

function rejectUpgrade(socket, status, text) {
    try {
        const body = `${text}\n`;
        socket.write(
            `HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n` +
            `Content-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
        );
    } catch {
        // The peer is already gone; destroying below is all that is left to do.
    }
    socket.destroy();
}

class WsConnection extends EventEmitter {
    constructor(socket, { maxBinaryBytes, maxTextBytes }) {
        super();
        this.socket = socket;
        this.maxBinaryBytes = maxBinaryBytes;
        this.maxTextBytes = maxTextBytes;
        this.buf = Buffer.alloc(0);
        this.offset = 0;
        this.frag = null;
        this.stopped = false;
        this.closing = false;
        this.closed = false;
        this.closeTimer = null;
        this.lastRecvAt = Date.now();
        this.bytesIn = 0;
        this.bytesOut = 0;

        socket.setNoDelay(true);
        socket.on('data', (chunk) => this.onData(chunk));
        socket.on('drain', () => this.emit('drain'));
        socket.on('error', () => this.destroy());
        socket.on('close', () => {
            this.closed = true;
            if (this.closeTimer) clearTimeout(this.closeTimer);
            this.closeTimer = null;
            this.emit('close');
        });
    }

    get bufferedAmount() {
        return this.socket.writableLength;
    }

    onData(chunk) {
        this.bytesIn += chunk.length;
        this.lastRecvAt = Date.now();
        if (this.stopped || this.closing || this.closed) return;

        this.buf = this.offset === 0
            ? Buffer.concat([this.buf, chunk])
            : Buffer.concat([this.buf.subarray(this.offset), chunk]);
        this.offset = 0;
        this.parse();

        if (this.offset > 0) {
            if (this.offset >= this.buf.length) {
                this.buf = Buffer.alloc(0);
                this.offset = 0;
            } else if (this.offset > COMPACT_AT) {
                this.buf = Buffer.from(this.buf.subarray(this.offset));
                this.offset = 0;
            }
        }
    }

    parse() {
        for (;;) {
            if (this.stopped || this.closing || this.closed) return;
            const available = this.buf.length - this.offset;
            if (available < 2) return;

            const b0 = this.buf[this.offset];
            const b1 = this.buf[this.offset + 1];
            const fin = (b0 & 0x80) !== 0;
            const rsv = b0 & 0x70;
            const opcode = b0 & 0x0f;
            const masked = (b1 & 0x80) !== 0;
            const short = b1 & 0x7f;

            if (rsv !== 0) return this.fail('rsv_set');
            if (!masked) return this.fail('unmasked_client_frame');

            let headerLen = 2 + 4;
            let payloadLen = short;
            if (short === 126) headerLen += 2;
            else if (short === 127) headerLen += 8;
            if (available < headerLen) return;

            if (short === 126) {
                payloadLen = this.buf.readUInt16BE(this.offset + 2);
            } else if (short === 127) {
                const big = this.buf.readBigUInt64BE(this.offset + 2);
                if (big > BigInt(Number.MAX_SAFE_INTEGER)) return this.fail('length_overflow');
                payloadLen = Number(big);
            }

            const control = (opcode & 0x8) !== 0;
            if (control) {
                if (!fin) return this.fail('fragmented_control');
                if (payloadLen > 125) return this.fail('oversized_control');
            } else if (opcode === OPCODE.TEXT || opcode === OPCODE.BINARY) {
                if (this.frag) return this.fail('interleaved_fragment');
            } else if (opcode === OPCODE.CONT) {
                if (!this.frag) return this.fail('orphan_continuation');
            } else {
                return this.fail('bad_opcode');
            }

            if (!control) {
                const kind = opcode === OPCODE.CONT ? this.frag.opcode : opcode;
                const cap = kind === OPCODE.BINARY ? this.maxBinaryBytes : this.maxTextBytes;
                const carried = this.frag ? this.frag.bytes : 0;
                if (carried + payloadLen > cap) {
                    this.stopped = true;
                    this.frag = null;
                    this.emit('oversize', { binary: kind === OPCODE.BINARY, bytes: carried + payloadLen });
                    return;
                }
            }

            if (available < headerLen + payloadLen) return;

            const maskStart = this.offset + headerLen - 4;
            const start = this.offset + headerLen;
            let payload = Buffer.alloc(0);
            if (payloadLen > 0) {
                payload = Buffer.allocUnsafe(payloadLen);
                this.buf.copy(payload, 0, start, start + payloadLen);
                for (let i = 0; i < payloadLen; i += 1) {
                    payload[i] ^= this.buf[maskStart + (i & 3)];
                }
            }
            this.offset = start + payloadLen;

            if (control) {
                this.handleControl(opcode, payload);
                continue;
            }

            if (opcode === OPCODE.CONT) {
                this.frag.chunks.push(payload);
                this.frag.bytes += payload.length;
                if (!fin) continue;
                const whole = Buffer.concat(this.frag.chunks, this.frag.bytes);
                const kind = this.frag.opcode;
                this.frag = null;
                this.deliver(kind, whole);
                continue;
            }

            if (!fin) {
                this.frag = { opcode, chunks: [payload], bytes: payload.length };
                continue;
            }
            this.deliver(opcode, payload);
        }
    }

    deliver(opcode, payload) {
        if (opcode === OPCODE.TEXT) this.emit('text', payload.toString('utf8'));
        else this.emit('binary', payload);
    }

    handleControl(opcode, payload) {
        if (opcode === OPCODE.PING) {
            this.sendRaw(OPCODE.PONG, [payload]);
            return;
        }
        if (opcode === OPCODE.PONG) {
            this.emit('pong', payload);
            return;
        }
        let code = 1005;
        if (payload.length >= 2) code = payload.readUInt16BE(0);
        this.emit('peerClose', code);
        this.closing = true;
        this.stopped = true;
        this.sendRaw(OPCODE.CLOSE, [payload.length >= 2 ? payload.subarray(0, 2) : Buffer.alloc(0)]);
        this.socket.end();
    }

    fail(reason) {
        this.emit('protocolError', reason);
        this.close(WS_PROTOCOL_ERROR, reason);
    }

    frameHeader(opcode, length) {
        if (length < 126) {
            const head = Buffer.allocUnsafe(2);
            head[0] = 0x80 | opcode;
            head[1] = length;
            return head;
        }
        if (length < 65536) {
            const head = Buffer.allocUnsafe(4);
            head[0] = 0x80 | opcode;
            head[1] = 126;
            head.writeUInt16BE(length, 2);
            return head;
        }
        const head = Buffer.allocUnsafe(10);
        head[0] = 0x80 | opcode;
        head[1] = 127;
        head.writeBigUInt64BE(BigInt(length), 2);
        return head;
    }

    sendRaw(opcode, parts) {
        if (this.closed || !this.socket.writable) return false;
        let length = 0;
        for (const part of parts) length += part.length;
        this.socket.cork();
        this.socket.write(this.frameHeader(opcode, length));
        for (const part of parts) {
            if (part.length > 0) this.socket.write(part);
        }
        this.socket.uncork();
        this.bytesOut += length;
        return true;
    }

    sendText(text) {
        if (this.closing) return false;
        return this.sendRaw(OPCODE.TEXT, [Buffer.from(text, 'utf8')]);
    }

    // Parts are written as one websocket frame without being concatenated first, so a media payload
    // is never copied just to prepend its 24 byte header.
    sendBinaryParts(parts) {
        if (this.closing) return false;
        return this.sendRaw(OPCODE.BINARY, parts);
    }

    ping() {
        if (this.closing) return false;
        return this.sendRaw(OPCODE.PING, [Buffer.alloc(0)]);
    }

    close(code, reason = '') {
        if (this.closing || this.closed) return;
        this.closing = true;
        this.stopped = true;
        const text = String(reason).slice(0, 120);
        const payload = Buffer.allocUnsafe(2 + Buffer.byteLength(text));
        payload.writeUInt16BE(code, 0);
        payload.write(text, 2, 'utf8');
        this.sendRaw(OPCODE.CLOSE, [payload]);
        this.socket.end();
        this.closeTimer = setTimeout(() => this.destroy(), CLOSE_LINGER_MS);
        if (typeof this.closeTimer.unref === 'function') this.closeTimer.unref();
    }

    destroy() {
        this.closing = true;
        this.stopped = true;
        if (this.closeTimer) clearTimeout(this.closeTimer);
        this.closeTimer = null;
        this.socket.destroy();
    }
}

module.exports = {
    WS_PROTOCOL_ERROR,
    OPCODE,
    computeAccept,
    acceptUpgrade,
    offersSubprotocol,
    rejectUpgrade,
    WsConnection,
};
