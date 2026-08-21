// Process wiring: the HTTP(S) listener, the websocket upgrade path (clause 1) and the optional
// control channel (clause 3.13). Nothing in this file knows what a bodycam is; the relay only ever
// sees stream keys and tokens.

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');

const { Hub } = require('./hub.js');
const { CONTROL_SKEW_MS, MAX_CONTROL_BYTES, MAX_MESSAGE_BYTES, STREAM_KEY_RE, SUBPROTOCOL } = require('./protocol.js');
const { Session } = require('./session.js');
const { WsConnection, acceptUpgrade, offersSubprotocol, rejectUpgrade } = require('./ws.js');

const CONTROL_BODY_MAX = 16_384;

function clientIp(req, trustProxy) {
    if (trustProxy) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.trim() !== '') return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
}

function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
}

function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error('body_too_large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function signatureOk(key, ts, rawBody, provided) {
    if (typeof provided !== 'string' || !/^[0-9a-f]{64}$/i.test(provided)) return false;
    const want = crypto.createHmac('sha256', key).update(`${ts}.${rawBody}`).digest();
    const got = Buffer.from(provided.toLowerCase(), 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function createRelay(config, log) {
    const hub = new Hub(config, log);

    async function onControl(req, res) {
        const ts = Number.parseInt(String(req.headers['x-sdmr-ts'] ?? ''), 10);
        let raw;
        try {
            raw = await readBody(req, CONTROL_BODY_MAX);
        } catch {
            sendJson(res, 413, { ok: false, error: 'body_too_large' });
            return;
        }

        if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > CONTROL_SKEW_MS) {
            sendJson(res, 401, { ok: false, error: 'stale_timestamp' });
            return;
        }
        if (!signatureOk(config.key, ts, raw, req.headers['x-sdmr-sig'])) {
            log.warn('control', 'rejected a control call with a bad signature', { ip: clientIp(req, config.trustProxy) });
            sendJson(res, 401, { ok: false, error: 'bad_signature' });
            return;
        }

        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch {
            sendJson(res, 400, { ok: false, error: 'bad_json' });
            return;
        }
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
            sendJson(res, 400, { ok: false, error: 'bad_json' });
            return;
        }

        const op = String(body.op ?? '');
        if (op === 'stats') {
            sendJson(res, 200, { ok: true, ...hub.stats() });
            return;
        }
        if (op === 'revoke' || op === 'gen') {
            const key = String(body.key ?? '');
            if (!STREAM_KEY_RE.test(key)) {
                sendJson(res, 400, { ok: false, error: 'bad_key' });
                return;
            }
            if (op === 'revoke') {
                const done = hub.revoke(key, String(body.reason ?? ''));
                sendJson(res, 200, { ok: true, applied: done });
                return;
            }
            const gen = Number.parseInt(String(body.gen ?? ''), 10);
            if (!Number.isFinite(gen) || gen < 0 || gen > 2147483647) {
                sendJson(res, 400, { ok: false, error: 'bad_gen' });
                return;
            }
            sendJson(res, 200, { ok: true, applied: hub.forceGen(key, gen) });
            return;
        }
        sendJson(res, 400, { ok: false, error: 'unknown_op' });
    }

    const handler = (req, res) => {
        const path = String(req.url ?? '/').split('?')[0];
        if (req.method === 'GET' && path === '/health') {
            sendJson(res, 200, hub.health());
            return;
        }
        if (req.method === 'POST' && path === '/control') {
            onControl(req, res).catch((err) => {
                log.error('control', 'control request failed', { error: err.message });
                if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal' });
            });
            return;
        }
        sendJson(res, 404, { ok: false, error: 'not_found', endpoints: ['GET /health', 'POST /control', 'WS upgrade on any path'] });
    };

    const server = config.tlsCert
        ? https.createServer({ cert: fs.readFileSync(config.tlsCert), key: fs.readFileSync(config.tlsKey) }, handler)
        : http.createServer(handler);

    server.on('upgrade', (req, socket) => {
        const ip = clientIp(req, config.trustProxy);
        hub.upgrades += 1;

        const banned = hub.bannedUntil(ip);
        if (banned > 0) {
            hub.rejected += 1;
            rejectUpgrade(socket, 429, 'Too Many Requests');
            return;
        }
        if (hub.sessions.size >= config.maxSockets) {
            hub.rejected += 1;
            log.warn('socket', 'socket cap reached, refusing the upgrade', { ip, cap: config.maxSockets });
            rejectUpgrade(socket, 503, 'Service Unavailable');
            return;
        }

        // Clause 1.8: a cheap filter, explicitly not authentication. A client that sends no Origin
        // at all (anything that is not a browser) is not a mismatch and is let through.
        const origin = typeof req.headers.origin === 'string' ? req.headers.origin.toLowerCase() : '';
        if (origin !== '' && !config.anyOrigin && !config.origins.includes(origin)) {
            hub.rejected += 1;
            log.warn('socket', 'refused an upgrade from an unexpected origin', { ip, origin });
            rejectUpgrade(socket, 403, 'Forbidden');
            return;
        }

        const subprotocol = offersSubprotocol(req, SUBPROTOCOL) ? SUBPROTOCOL : null;
        if (!acceptUpgrade(req, socket, { subprotocol })) {
            hub.rejected += 1;
            rejectUpgrade(socket, 400, 'Bad Request');
            return;
        }

        const ws = new WsConnection(socket, {
            maxBinaryBytes: MAX_MESSAGE_BYTES,
            maxTextBytes: MAX_CONTROL_BYTES,
        });
        const session = new Session(hub, ws, { ip, origin });
        hub.addSession(session);
        log.debug('socket', 'upgraded', { ip, origin: origin || '-', sockets: hub.sessions.size });
    });

    server.on('clientError', (err, socket) => {
        if (socket.writable) rejectUpgrade(socket, 400, 'Bad Request');
    });

    return {
        hub,
        server,
        listen() {
            return new Promise((resolve) => server.listen(config.port, config.host, resolve));
        },
        address() {
            return server.address();
        },
        async close() {
            hub.dispose();
            await new Promise((resolve) => server.close(resolve));
        },
    };
}

module.exports = {
    createRelay,
};
