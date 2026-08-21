// Clause 1 (transport), clause 3.11 (auth failure handling) and clause 4 (control messages). One
// Session wraps one websocket: every stream a client publishes or watches multiplexes over it.

const crypto = require('node:crypto');

const { decodeFrame } = require('./frame.js');
const { CLOSE, CONTROL_HEADROOM, HARD_LIMIT, HELLO_TIMEOUT_MS, MAX_MESSAGE_BYTES, MAX_STREAMS_GLOBAL, MAX_STREAMS_PER_SOCKET, SDMR_HEADER_BYTES, SOCKET_IDLE_MS, SOFT_LIMIT, STREAM_KEY_RE, MODES, WIRES, WIRE_VERSION } = require('./protocol.js');
const { verifyToken } = require('./token.js');

// Clause 3.11: how each verification failure is answered.
const AUTH_FAILURE = {
    token_malformed: { close: CLOSE.PROTOCOL, message: 'token malformed' },
    token_bad_signature: { close: CLOSE.AUTH, message: 'token signature mismatch' },
    token_replayed: { close: CLOSE.AUTH, message: 'token already used' },
    token_scope: { close: CLOSE.SCOPE, message: 'token scope mismatch' },
    token_expired: { close: CLOSE.AUTH, message: 'token expired' },
    overloaded: { close: CLOSE.INTERNAL, message: 'relay overloaded' },
};

const ABUSE_CODES = new Set(['token_malformed', 'token_bad_signature', 'token_replayed', 'token_scope']);

function text(value, max) {
    return typeof value === 'string' && value.length <= max ? value : null;
}

function integer(value, min, max, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(value)));
}

class Session {
    constructor(hub, ws, info) {
        this.hub = hub;
        this.log = hub.log;
        this.ws = ws;
        this.ip = info.ip;
        this.origin = info.origin;
        this.device = '';
        this.build = '';
        this.sub = '';
        this.id = crypto.randomBytes(8).toString('hex');
        this.helloDone = false;
        this.streams = new Map();
        this.nextSid = 1;
        this.pendingBytes = 0;
        this.slowDetaches = 0;
        this.closed = false;
        this.shuttingDown = false;
        this.openedAt = Date.now();

        this.helloTimer = setTimeout(() => {
            if (this.helloDone || this.closed) return;
            this.log.debug('socket', 'hello timeout', { ip: this.ip });
            this.shutdown(CLOSE.TIMEOUT, 'hello_timeout');
        }, HELLO_TIMEOUT_MS);
        if (typeof this.helloTimer.unref === 'function') this.helloTimer.unref();

        ws.on('text', (raw) => this.onText(raw));
        ws.on('binary', (buf) => this.onBinary(buf));
        ws.on('drain', () => this.flush());
        ws.on('oversize', (info2) => this.onOversize(info2));
        ws.on('protocolError', (reason) => this.log.debug('socket', 'websocket framing error', { ip: this.ip, reason }));
        ws.on('close', () => this.onClose());
    }

    get idleFor() {
        return Date.now() - this.ws.lastRecvAt;
    }

    load() {
        return this.ws.bufferedAmount + this.pendingBytes;
    }

    hasViewers() {
        for (const entry of this.streams.values()) {
            if (entry.role === 'view') return true;
        }
        return false;
    }

    // Clause 6.4: control is never dropped and never queued behind media.
    sendJson(message) {
        if (this.closed || this.ws.closing) return;
        this.ws.sendText(JSON.stringify(message));
        if (this.shuttingDown) return;
        const load = this.load();
        if (load > HARD_LIMIT + CONTROL_HEADROOM) {
            this.log.warn('socket', 'control backlog past the hard limit', { ip: this.ip, sub: this.sub, load });
            this.shutdown(CLOSE.INTERNAL, 'control_backlog');
            return;
        }
        if (!this.hasViewers() && load > CONTROL_HEADROOM) {
            this.log.warn('socket', 'publisher socket is not draining control', { ip: this.ip, sub: this.sub, load });
            this.shutdown(CLOSE.INTERNAL, 'publisher_backlog');
        }
    }

    sendError(code, message, sid, fatal) {
        const payload = { t: 'error', code, message, fatal };
        if (sid !== undefined && sid !== null) payload.sid = sid;
        this.sendJson(payload);
    }

    // Clause 4.17: a bye names the reason CEF would otherwise flatten into 1006.
    shutdown(code, reason) {
        if (this.closed || this.shuttingDown) return;
        this.shuttingDown = true;
        this.sendJson({ t: 'bye', code, reason });
        this.ws.close(code, reason);
    }

    // Clause 6.2: pending frames are handed to the socket while it is under the soft limit; past it
    // they stay queued, which is what raises `load` and arms the drop rules.
    flush() {
        if (this.closed || this.ws.closing) return;
        let progress = true;
        while (progress && this.ws.bufferedAmount < SOFT_LIMIT) {
            progress = false;
            for (const entry of this.streams.values()) {
                if (entry.role !== 'view') continue;
                const viewer = entry.viewer;
                if (viewer.pending.length === 0) continue;
                const item = viewer.pending.shift();
                viewer.pendingBytes -= item.bytes;
                this.pendingBytes -= item.bytes;
                this.ws.sendBinaryParts(item.parts);
                progress = true;
                if (this.ws.bufferedAmount >= SOFT_LIMIT) break;
            }
        }
    }

    releaseStream(sid, slow) {
        const entry = this.streams.get(sid);
        if (!entry) return;
        this.streams.delete(sid);
        if (entry.role === 'view') {
            entry.viewer.detached = true;
            entry.viewer.clearPending();
        }
        if (slow) {
            this.slowDetaches += 1;
            if (this.streams.size === 0) this.shutdown(CLOSE.RATE_LIMITED, 'too_slow');
        }
    }

    onOversize({ binary, bytes }) {
        if (binary) {
            this.sendError('frame_too_large', 'binary message over the 1 MiB cap', undefined, true);
            this.log.warn('socket', 'oversized binary message', { ip: this.ip, sub: this.sub, bytes });
            this.shutdown(CLOSE.TOO_LARGE, 'frame_too_large');
            return;
        }
        this.sendError('bad_message', 'control message over the 8 KiB cap', undefined, true);
        this.log.warn('socket', 'oversized control message', { ip: this.ip, sub: this.sub, bytes });
        this.shutdown(CLOSE.PROTOCOL, 'control_too_large');
    }

    onText(raw) {
        if (this.closed) return;
        let message;
        try {
            message = JSON.parse(raw);
        } catch {
            this.sendError('bad_message', 'control message is not json', undefined, true);
            this.shutdown(CLOSE.PROTOCOL, 'bad_json');
            return;
        }
        if (message === null || typeof message !== 'object' || Array.isArray(message)) {
            this.sendError('bad_message', 'control message is not an object', undefined, true);
            this.shutdown(CLOSE.PROTOCOL, 'bad_message');
            return;
        }

        const type = message.t;
        if (!this.helloDone) {
            if (type !== 'hello') {
                this.sendError('no_hello', 'hello must be the first message', undefined, true);
                this.shutdown(CLOSE.PROTOCOL, 'no_hello');
                return;
            }
            this.onHello(message);
            return;
        }

        switch (type) {
            case 'hello':
                this.sendError('bad_message', 'hello already sent', undefined, true);
                this.shutdown(CLOSE.PROTOCOL, 'duplicate_hello');
                return;
            case 'publish':
                this.onPublish(message);
                return;
            case 'unpublish':
                this.onUnpublish(message);
                return;
            case 'join':
                this.onJoin(message);
                return;
            case 'leave':
                this.onLeave(message);
                return;
            case 'keyframe':
                this.onKeyframe(message);
                return;
            case 'ping':
                this.sendJson({ t: 'pong', ts: message.ts, serverTimeMs: Date.now() });
                return;
            case 'bye':
                this.ws.close(CLOSE.NORMAL, 'bye');
                return;
            default:
                this.sendError('unknown_type', `unknown control type ${String(type).slice(0, 32)}`, undefined, false);
        }
    }

    // Returns the verified payload, or null after answering per clause 3.11.
    checkToken(token, role, streamKey, sid) {
        const result = verifyToken(token, {
            key: this.hub.config.key,
            role,
            streamKey,
            sub: this.helloDone ? this.sub : undefined,
            jtiStore: this.hub.jti,
        });
        if (result.ok) return result.payload;

        const failure = AUTH_FAILURE[result.code] ?? AUTH_FAILURE.token_malformed;
        // Clause 3.11: an expired token outside hello is recoverable, the socket stays usable.
        const fatal = !(result.code === 'token_expired' && this.helloDone);
        this.sendError(result.code, failure.message, sid, fatal);
        this.log.debug('auth', 'token rejected', { ip: this.ip, role, key: streamKey || '-', code: result.code });

        // Clause 3.11: only the four failures that are never a legitimate client feed the abuse
        // counter. An expired token is ordinary, and an overloaded relay is not the caller's doing.
        if (ABUSE_CODES.has(result.code)) this.hub.recordAuthFailure(this.ip);
        if (fatal) this.shutdown(failure.close, result.code);
        return null;
    }

    onHello(message) {
        if (message.v !== undefined && message.v !== WIRE_VERSION) {
            this.sendError('bad_message', 'unsupported wire version', undefined, true);
            this.shutdown(CLOSE.PROTOCOL, 'bad_version');
            return;
        }

        const payload = this.checkToken(message.token, 'session', '', undefined);
        if (!payload) return;

        clearTimeout(this.helloTimer);
        this.helloTimer = null;
        this.helloDone = true;
        this.sub = payload.sub;
        this.device = text(message.device, 16) ?? '';
        this.build = text(message.build, 32) ?? '';

        this.sendJson({
            t: 'welcome',
            v: WIRE_VERSION,
            sub: this.sub,
            session: this.id,
            serverTimeMs: Date.now(),
            limits: {
                maxStreams: MAX_STREAMS_PER_SOCKET,
                maxMessageBytes: MAX_MESSAGE_BYTES,
                pingMs: 10000,
                idleMs: SOCKET_IDLE_MS,
            },
        });
        this.log.info('socket', 'client ready', {
            ip: this.ip,
            sub: this.sub,
            src: payload.src,
            device: this.device || '-',
            build: this.build || '-',
        });
    }

    streamKeyOf(message, sid) {
        const key = text(message.key, 200);
        if (key === null || !STREAM_KEY_RE.test(key)) {
            this.sendError('bad_message', 'stream key is not valid', sid, false);
            return null;
        }
        return key;
    }

    capacityOk(key, sid) {
        if (this.streams.size >= MAX_STREAMS_PER_SOCKET) {
            this.sendError('too_many_streams', 'stream cap for this socket reached', sid, false);
            return false;
        }
        if (!this.hub.streams.has(key) && this.hub.streams.size >= MAX_STREAMS_GLOBAL) {
            this.sendError('overloaded', 'relay stream cap reached', sid, false);
            return false;
        }
        return true;
    }

    onPublish(message) {
        const key = this.streamKeyOf(message);
        if (!key) return;
        if (!this.capacityOk(key)) return;

        const mode = text(message.mode, 16) ?? 'video';
        const wire = text(message.wire, 16) ?? '';
        if (!MODES.has(mode) || !WIRES.has(wire)) {
            this.sendError('bad_message', 'publish mode or wire is not valid', undefined, false);
            return;
        }

        const payload = this.checkToken(message.token, 'publish', key);
        if (!payload) return;

        // Clause 5.2 fences on the token's gen, which is the value the game server signed.
        const gen = payload.gen;
        const stream = this.hub.getStream(key);
        if (stream && stream.publisher === this) {
            // The same socket re-publishing is a re-anchor, not a conflict: clause 9.2 has a
            // publisher re-publish in place when its generation changes.
            const previous = stream.publisherSid;
            stream.publisher = null;
            this.releaseStream(previous, false);
        } else if (stream && stream.publisher) {
            if (gen > stream.gen) {
                const evicted = stream.publisher;
                stream.publisher = null;
                this.log.warn('stream', 'publisher superseded by a newer generation', {
                    key,
                    was: stream.gen,
                    now: gen,
                    sub: evicted.sub,
                });
                evicted.shutdown(CLOSE.DUPLICATE, 'superseded');
            } else {
                this.sendError('stream_busy', 'another publisher holds this stream', undefined, false);
                return;
            }
        }

        const target = stream ?? this.hub.createStream(key);
        const sid = this.nextSid;
        this.nextSid += 1;
        this.streams.set(sid, { role: 'pub', stream: target });

        this.sendJson({ t: 'ready', sid, key, gen, viewers: target.viewerCount });
        target.attachPublisher(this, sid, {
            mode,
            wire,
            codec: text(message.codec, 64) ?? '',
            mime: text(message.mime, 128) ?? '',
            width: integer(message.width, 0, 8192, 0),
            height: integer(message.height, 0, 8192, 0),
            fps: integer(message.fps, 0, 240, 0),
            bitrate: integer(message.bitrate, 1, 12000000, 1000000),
        }, gen);
    }

    onUnpublish(message) {
        const sid = integer(message.sid, 0, 0xffffffff, 0);
        const entry = this.streams.get(sid);
        if (!entry || entry.role !== 'pub') {
            this.sendError('stream_unknown', 'no such published stream', sid, false);
            return;
        }
        entry.stream.detachPublisher('unpublished');
        this.releaseStream(sid, false);
    }

    onJoin(message) {
        const key = this.streamKeyOf(message);
        if (!key) return;
        if (!this.capacityOk(key)) return;

        const payload = this.checkToken(message.token, 'watch', key);
        if (!payload) return;

        const stream = this.hub.getStream(key) ?? this.hub.createStream(key);
        const sid = this.nextSid;
        this.nextSid += 1;
        const viewer = stream.addViewer(this, sid);
        this.streams.set(sid, { role: 'view', stream, viewer });

        this.sendJson({
            t: 'joined',
            sid,
            key,
            gen: stream.gen,
            ...stream.descFields(),
            live: stream.publisher !== null,
            viewers: stream.viewerCount,
        });
        this.log.debug('stream', 'viewer joined', { key, sub: this.sub, viewers: stream.viewerCount });
        stream.primeViewer(viewer);
    }

    onLeave(message) {
        const sid = integer(message.sid, 0, 0xffffffff, 0);
        const entry = this.streams.get(sid);
        if (!entry || entry.role !== 'view') {
            this.sendError('stream_unknown', 'no such watched stream', sid, false);
            return;
        }
        entry.stream.removeViewer(entry.viewer);
        this.releaseStream(sid, false);
    }

    onKeyframe(message) {
        const sid = integer(message.sid, 0, 0xffffffff, 0);
        const entry = this.streams.get(sid);
        if (!entry || entry.role !== 'view') {
            this.sendError('stream_unknown', 'no such watched stream', sid, false);
            return;
        }
        entry.stream.requestKeyframe('viewer_request');
    }

    onBinary(buf) {
        if (this.closed) return;
        if (!this.helloDone) {
            this.sendError('no_hello', 'hello must be the first message', undefined, true);
            this.shutdown(CLOSE.PROTOCOL, 'no_hello');
            return;
        }

        const decoded = decodeFrame(buf);
        if (!decoded.ok) {
            this.sendError('bad_message', `media frame rejected (${decoded.reason})`, undefined, true);
            this.log.debug('socket', 'malformed media frame', { ip: this.ip, sub: this.sub, reason: decoded.reason });
            this.shutdown(CLOSE.PROTOCOL, `bad_frame_${decoded.reason}`);
            return;
        }

        // Clause 2.5: an unknown or released sid is a legitimate race with leave, so it is dropped
        // in silence rather than treated as a protocol error.
        const entry = this.streams.get(decoded.header.sid);
        if (!entry || entry.role !== 'pub') return;
        entry.stream.ingest(decoded.header, buf.subarray(SDMR_HEADER_BYTES));
    }

    onClose() {
        if (this.closed) return;
        this.closed = true;
        if (this.helloTimer) clearTimeout(this.helloTimer);
        this.helloTimer = null;

        for (const [, entry] of this.streams) {
            if (entry.role === 'pub') {
                if (entry.stream.publisher === this) entry.stream.detachPublisher('publisher_gone');
            } else {
                entry.viewer.clearPending();
                entry.stream.removeViewer(entry.viewer);
            }
        }
        this.streams.clear();
        this.pendingBytes = 0;
        this.hub.removeSession(this);
        this.log.debug('socket', 'closed', { ip: this.ip, sub: this.sub || '-', ms: Date.now() - this.openedAt });
    }

    stats() {
        return {
            sub: this.sub,
            ip: this.ip,
            device: this.device,
            streams: this.streams.size,
            pendingBytes: this.pendingBytes,
            bufferedAmount: this.ws.bufferedAmount,
            uptimeMs: Date.now() - this.openedAt,
        };
    }
}

module.exports = {
    Session,
};
