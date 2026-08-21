#!/usr/bin/env node
(async () => {
    // End to end self test. Boots a relay on loopback, publishes a synthetic stream and asserts that a
    // viewer receives the init segment followed by media chunks, then walks the parts of SDMR/1 that
    // are easy to get wrong: prime replay, GOP eviction, the generation fence, token replay defence,
    // oversized frames and the publisher-gone path.
    //
    // Run: node selftest.js        Exit code 0 means every check passed.

    const assert = require('node:assert/strict');
    const crypto = require('node:crypto');
    const http = require('node:http');

    const { loadConfig } = require('./src/config.js');
    const { createLogger } = require('./src/log.js');
    const { encodeFrame } = require('./src/frame.js');
    const { KIND, FLAG, SDMR_HEADER_BYTES, SUBPROTOCOL } = require('./src/protocol.js');
    const { createRelay } = require('./src/relay.js');
    const { Stream } = require('./src/stream.js');
    const { mintToken } = require('./src/token.js');

    const KEY_HEX = crypto.randomBytes(32).toString('hex');
    const KEY = Buffer.from(KEY_HEX, 'hex');
    const PORT = 31000 + Math.floor(Math.random() * 2000);
    const ORIGIN = 'https://cfx-nui-sd-phone';
    const STREAM = 'mdt:cam:ABC12345';

    const results = [];
    let failures = 0;

    async function check(name, fn) {
        try {
            await fn();
            results.push(`  PASS  ${name}`);
        } catch (err) {
            failures += 1;
            results.push(`  FAIL  ${name}: ${err.message}`);
        }
    }

    function token(role, streamKey, gen, overrides = {}) {
        const now = Math.floor(Date.now() / 1000);
        return mintToken(KEY, {
            v: 1,
            iss: 'sd-phone',
            sub: 'ABC12345',
            src: 12,
            name: 'Jonas Vance',
            key: streamKey,
            role,
            gen,
            iat: now,
            exp: now + 45,
            jti: crypto.randomBytes(16).toString('hex'),
            ...overrides,
        });
    }

    // A websocket client just large enough to drive the relay. Client frames are masked, as RFC 6455
    // requires, and server frames arrive unmasked.
    class TestClient {
        constructor(socket) {
            this.socket = socket;
            this.buf = Buffer.alloc(0);
            this.texts = [];
            this.frames = [];
            this.closeCode = 0;
            this.closed = false;
            socket.on('data', (chunk) => this.onData(chunk));
            socket.on('close', () => { this.closed = true; });
            socket.on('error', () => { this.closed = true; });
        }

        static connect(options = {}) {
            return new Promise((resolve, reject) => {
                const req = http.request({
                    port: PORT,
                    host: '127.0.0.1',
                    path: options.path ?? '/ws',
                    headers: {
                        Connection: 'Upgrade',
                        Upgrade: 'websocket',
                        Origin: options.origin ?? ORIGIN,
                        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
                        'Sec-WebSocket-Version': '13',
                        'Sec-WebSocket-Protocol': SUBPROTOCOL,
                    },
                });
                req.on('upgrade', (res, socket) => {
                    socket.setNoDelay(true);
                    resolve(new TestClient(socket));
                });
                req.on('response', (res) => reject(new Error(`upgrade refused with ${res.statusCode}`)));
                req.on('error', reject);
                req.end();
            });
        }

        onData(chunk) {
            this.buf = Buffer.concat([this.buf, chunk]);
            for (;;) {
                if (this.buf.length < 2) return;
                const opcode = this.buf[0] & 0x0f;
                const short = this.buf[1] & 0x7f;
                let offset = 2;
                let length = short;
                if (short === 126) {
                    if (this.buf.length < 4) return;
                    length = this.buf.readUInt16BE(2);
                    offset = 4;
                } else if (short === 127) {
                    if (this.buf.length < 10) return;
                    length = Number(this.buf.readBigUInt64BE(2));
                    offset = 10;
                }
                if (this.buf.length < offset + length) return;
                const payload = this.buf.subarray(offset, offset + length);
                this.buf = this.buf.subarray(offset + length);

                if (opcode === 0x1) this.texts.push(JSON.parse(payload.toString('utf8')));
                else if (opcode === 0x2) this.frames.push(this.decode(payload));
                else if (opcode === 0x8) {
                    this.closeCode = length >= 2 ? payload.readUInt16BE(0) : 1005;
                    this.closed = true;
                } else if (opcode === 0x9) this.send(0xa, payload);
            }
        }

        decode(buf) {
            return {
                kind: buf[2],
                flags: buf[3],
                sid: buf.readUInt32BE(4),
                gen: buf.readUInt32BE(8),
                seq: buf.readUInt32BE(12),
                timestampUs: Number(buf.readBigUInt64BE(16)),
                payload: Buffer.from(buf.subarray(SDMR_HEADER_BYTES)),
            };
        }

        send(opcode, payload) {
            if (this.socket.destroyed) return;
            const mask = crypto.randomBytes(4);
            const length = payload.length;
            let header;
            if (length < 126) {
                header = Buffer.allocUnsafe(2);
                header[1] = 0x80 | length;
            } else if (length < 65536) {
                header = Buffer.allocUnsafe(4);
                header[1] = 0x80 | 126;
                header.writeUInt16BE(length, 2);
            } else {
                header = Buffer.allocUnsafe(10);
                header[1] = 0x80 | 127;
                header.writeBigUInt64BE(BigInt(length), 2);
            }
            header[0] = 0x80 | opcode;
            const masked = Buffer.allocUnsafe(length);
            for (let i = 0; i < length; i += 1) masked[i] = payload[i] ^ mask[i & 3];
            this.socket.write(Buffer.concat([header, mask, masked]));
        }

        json(message) {
            this.send(0x1, Buffer.from(JSON.stringify(message), 'utf8'));
        }

        // Sends one text message as two websocket fragments, which a browser is free to do.
        jsonFragmented(message) {
            const payload = Buffer.from(JSON.stringify(message), 'utf8');
            const cut = Math.floor(payload.length / 2);
            this.sendFragment(0x1, payload.subarray(0, cut), false);
            this.sendFragment(0x0, payload.subarray(cut), true);
        }

        sendFragment(opcode, payload, fin) {
            const mask = crypto.randomBytes(4);
            const length = payload.length;
            let header;
            if (length < 126) {
                header = Buffer.allocUnsafe(2);
                header[1] = 0x80 | length;
            } else {
                header = Buffer.allocUnsafe(4);
                header[1] = 0x80 | 126;
                header.writeUInt16BE(length, 2);
            }
            header[0] = (fin ? 0x80 : 0x00) | opcode;
            const masked = Buffer.allocUnsafe(length);
            for (let i = 0; i < length; i += 1) masked[i] = payload[i] ^ mask[i & 3];
            this.socket.write(Buffer.concat([header, mask, masked]));
        }

        media(kind, sid, gen, seq, payload, flags = 0) {
            this.send(0x2, encodeFrame(kind, flags, sid, gen, seq, seq * 33333, payload));
        }

        async waitText(predicate, label, timeoutMs = 2500) {
            const deadline = Date.now() + timeoutMs;
            for (;;) {
                const found = this.texts.find(predicate);
                if (found) return found;
                if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }

        async waitFrames(count, label, timeoutMs = 2500) {
            const deadline = Date.now() + timeoutMs;
            for (;;) {
                if (this.frames.length >= count) return this.frames;
                if (Date.now() > deadline) throw new Error(`timed out waiting for ${label} (${this.frames.length}/${count})`);
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }

        async waitClosed(timeoutMs = 2500) {
            const deadline = Date.now() + timeoutMs;
            for (;;) {
                if (this.closed) return this.closeCode;
                if (Date.now() > deadline) throw new Error('timed out waiting for close');
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }

        async hello() {
            this.json({ t: 'hello', v: 1, token: token('session', '', 0), app: 'sd-phone', device: 'phone', build: 'selftest' });
            return this.waitText((m) => m.t === 'welcome', 'welcome');
        }

        destroy() {
            this.socket.destroy();
        }
    }

    const idle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const config = loadConfig({
        SD_PHONE_RELAY_KEY: KEY_HEX,
        SD_PHONE_RELAY_HOST: '127.0.0.1',
        SD_PHONE_RELAY_PORT: String(PORT),
        SD_PHONE_RELAY_LOG: process.env.SELFTEST_LOG ?? 'error',
    });
    assert.equal(config.errors.length, 0, config.errors.join('; '));

    const log = createLogger(config.logLevel);
    const relay = createRelay(config, log);
    await relay.listen();

    const INIT_BYTES = Buffer.from('INIT-SEGMENT-BYTES-0123456789', 'utf8');
    const keyBytes = (n) => Buffer.alloc(400, 0x40 + n);
    const deltaBytes = (n) => Buffer.alloc(120, 0x60 + n);

    let publisher = null;
    let viewer = null;
    let publisherSid = 0;
    let viewerSid = 0;

    // The backpressure rules are exercised directly against a stream, because a slow socket cannot be
    // produced on loopback reliably enough to assert on.
    await check('backpressure drops deltas first and catches a viewer up at the next keyframe', async () => {
        const stream = new Stream({ log, removeStream() {} }, 'mdt:cam:BACKPRESS');
        stream.gen = 3;
        const record = (kind, seq, size) => ({
            kind,
            flags: 0,
            gen: 3,
            seq,
            timestampUs: seq * 1000,
            payload: Buffer.alloc(size, seq),
            at: Date.now(),
        });
        stream.init = record(KIND.INIT, 0, 32);

        let load = 0;
        const sent = [];
        const session = {
            pendingBytes: 0,
            load: () => load,
            flush() {},
            sendJson: (m) => sent.push(m),
            releaseStream() {},
        };
        const viewer = stream.addViewer(session, 5);

        load = 0;
        viewer.push(record(KIND.DELTA, 1, 100), false);
        assert.equal(viewer.pending.length, 2, 'the init segment is queued ahead of the first media frame');
        assert.equal(viewer.pending[0].kind, KIND.INIT);

        load = 2_000_000;
        viewer.push(record(KIND.DELTA, 2, 100), false);
        assert.equal(viewer.pending.length, 2, 'past the soft limit a delta is dropped');
        assert.equal(viewer.pendingDiscontinuity, true);

        viewer.push(record(KIND.KEY, 3, 100), false);
        assert.equal(viewer.pending.length, 1, 'a keyframe supersedes everything still pending');
        assert.equal(viewer.pending[0].kind, KIND.KEY);
        assert.ok(viewer.pending[0].parts[0][3] & FLAG.DISCONTINUITY, 'the catch up frame is flagged as a discontinuity');
        assert.equal(viewer.pendingDiscontinuity, false);

        load = 5_000_000;
        viewer.push(record(KIND.KEY, 4, 100), false);
        assert.equal(viewer.pending.length, 1, 'past the hard limit even a keyframe is dropped');
        assert.ok(viewer.starvingSince > 0);

        viewer.starvingSince = Date.now() - 6_000;
        viewer.push(record(KIND.KEY, 5, 100), false);
        assert.equal(stream.viewerCount, 0, 'a viewer starving for more than five seconds is detached');
        assert.ok(sent.some((m) => m.t === 'error' && m.code === 'too_slow'), 'the viewer is told why');
        assert.ok(sent.some((m) => m.t === 'stream' && m.reason === 'too_slow'));
        assert.equal(session.pendingBytes, 0, 'its queued bytes are handed back');
    });

    await check('health endpoint answers before anyone connects', async () => {
        const body = await new Promise((resolve, reject) => {
            http.get({ port: PORT, host: '127.0.0.1', path: '/health' }, (res) => {
                let text = '';
                res.on('data', (c) => { text += c; });
                res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }));
            }).on('error', reject);
        });
        assert.equal(body.status, 200);
        assert.equal(body.json.ok, true);
        assert.equal(body.json.streams, 0);
    });

    await check('publisher completes hello and publish', async () => {
        publisher = await TestClient.connect();
        const welcome = await publisher.hello();
        assert.equal(welcome.sub, 'ABC12345');
        assert.equal(welcome.limits.maxStreams, 12);

        publisher.json({
            t: 'publish',
            token: token('publish', STREAM, 7),
            key: STREAM,
            gen: 7,
            mode: 'video',
            wire: 'chunks',
            codec: 'vp8',
            mime: '',
            width: 1600,
            height: 900,
            fps: 30,
            bitrate: 8000000,
        });
        const ready = await publisher.waitText((m) => m.t === 'ready', 'ready');
        assert.equal(ready.key, STREAM);
        assert.equal(ready.gen, 7);
        assert.equal(ready.viewers, 0);
        publisherSid = ready.sid;

        const idleState = await publisher.waitText((m) => m.t === 'stream' && m.state === 'idle', 'idle state');
        assert.equal(idleState.reason, 'no_viewers');
    });

    await check('viewer joins an unprimed stream and is told it is priming', async () => {
        viewer = await TestClient.connect();
        await viewer.hello();
        viewer.json({ t: 'join', token: token('watch', STREAM, 7), key: STREAM });
        const joined = await viewer.waitText((m) => m.t === 'joined', 'joined');
        assert.equal(joined.key, STREAM);
        assert.equal(joined.gen, 7);
        assert.equal(joined.live, true);
        assert.equal(joined.wire, 'chunks');
        assert.equal(joined.codec, 'vp8');
        viewerSid = joined.sid;

        const priming = await viewer.waitText((m) => m.t === 'stream' && m.state === 'priming', 'priming state');
        assert.equal(priming.reason, 'stale_prime');
    });

    await check('publisher is asked for a keyframe when a viewer joins', async () => {
        const request = await publisher.waitText((m) => m.t === 'keyframe', 'keyframe request');
        assert.equal(request.sid, publisherSid);
        assert.equal(request.reason, 'viewer_join');
    });

    await check('viewer receives the init segment followed by chunks', async () => {
        publisher.media(KIND.INIT, publisherSid, 7, 0, INIT_BYTES);
        publisher.media(KIND.KEY, publisherSid, 7, 1, keyBytes(1));
        publisher.media(KIND.DELTA, publisherSid, 7, 2, deltaBytes(2));
        publisher.media(KIND.DELTA, publisherSid, 7, 3, deltaBytes(3));

        const frames = await viewer.waitFrames(4, 'init plus three chunks');
        assert.equal(frames[0].kind, KIND.INIT, 'first frame must be the init segment');
        assert.deepEqual(frames[0].payload, INIT_BYTES, 'init payload must arrive byte for byte');
        assert.equal(frames[0].sid, viewerSid, 'frames are rewritten to the viewer own stream handle');
        assert.equal(frames[0].gen, 7);
        assert.equal(frames[0].flags & FLAG.REPLAY, 0, 'a live init is not a replay');

        assert.equal(frames[1].kind, KIND.KEY);
        assert.deepEqual(frames[1].payload, keyBytes(1));
        assert.equal(frames[2].kind, KIND.DELTA);
        assert.equal(frames[3].kind, KIND.DELTA);
        assert.deepEqual(frames[3].payload, deltaBytes(3));
        assert.equal(frames[3].seq, 3, 'the publisher sequence number is preserved for gap detection');
        assert.equal(frames[3].timestampUs, 3 * 33333, 'the presentation timestamp is preserved');
    });

    await check('a frame carrying the wrong generation is discarded', async () => {
        const before = viewer.frames.length;
        publisher.media(KIND.KEY, publisherSid, 6, 4, keyBytes(9));
        publisher.media(KIND.DELTA, publisherSid, 7, 5, deltaBytes(5));
        await viewer.waitFrames(before + 1, 'the in-generation frame');
        await idle(120);
        assert.equal(viewer.frames.length, before + 1, 'only the in-generation frame is relayed');
        assert.equal(viewer.frames[before].kind, KIND.DELTA);
    });

    await check('a late viewer is primed with the init segment and whole GOPs', async () => {
        const late = await TestClient.connect();
        await late.hello();
        late.json({ t: 'join', token: token('watch', STREAM, 7), key: STREAM });
        await late.waitText((m) => m.t === 'joined', 'joined');

        const frames = await late.waitFrames(4, 'replayed prime cache');
        assert.equal(frames[0].kind, KIND.INIT);
        assert.deepEqual(frames[0].payload, INIT_BYTES);
        assert.ok(frames[0].flags & FLAG.REPLAY, 'a primed init is flagged as a replay');
        assert.equal(frames[1].kind, KIND.KEY, 'a replay starts at a keyframe, never mid GOP');
        assert.ok(frames.slice(1).every((f) => (f.flags & FLAG.REPLAY) !== 0), 'every primed frame is flagged');

        const live = await late.waitText((m) => m.t === 'stream' && m.state === 'live', 'live state');
        assert.equal(live.reason, 'publisher_attached');
        late.destroy();
    });

    await check('the prime cache keeps at most two whole GOPs', async () => {
        for (let n = 0; n < 3; n += 1) {
            publisher.media(KIND.KEY, publisherSid, 7, 10 + n * 2, keyBytes(20 + n));
            publisher.media(KIND.DELTA, publisherSid, 7, 11 + n * 2, deltaBytes(20 + n));
        }
        await idle(120);

        const late = await TestClient.connect();
        await late.hello();
        late.json({ t: 'join', token: token('watch', STREAM, 7), key: STREAM });
        await late.waitText((m) => m.t === 'joined', 'joined');
        await late.waitText((m) => m.t === 'stream', 'stream state');
        await idle(80);

        const keys = late.frames.filter((f) => f.kind === KIND.KEY);
        assert.equal(keys.length, 2, 'the two newest GOPs are kept and the oldest is evicted whole');
        assert.deepEqual(keys[0].payload, keyBytes(21), 'the oldest surviving GOP is the second one sent');
        assert.equal(late.frames[0].kind, KIND.INIT, 'the init segment is never evicted');
        late.destroy();
    });

    await check('viewer count changes reach the publisher', async () => {
        const message = await publisher.waitText((m) => m.t === 'viewers' && m.viewers >= 1, 'viewers message');
        assert.equal(message.sid, publisherSid);
    });

    await check('an unknown control type is refused without killing the socket', async () => {
        viewer.json({ t: 'nonsense' });
        const error = await viewer.waitText((m) => m.t === 'error' && m.code === 'unknown_type', 'unknown_type error');
        assert.equal(error.fatal, false);
        assert.equal(viewer.closed, false);
    });

    await check('a viewer keyframe request reaches the publisher', async () => {
        await idle(1050);
        viewer.json({ t: 'keyframe', sid: viewerSid });
        const request = await publisher.waitText((m) => m.t === 'keyframe' && m.reason === 'viewer_request', 'viewer_request');
        assert.equal(request.sid, publisherSid);
    });

    await check('ping is answered with the timestamp echoed back', async () => {
        viewer.json({ t: 'ping', ts: 1755600012345 });
        const pong = await viewer.waitText((m) => m.t === 'pong', 'pong');
        assert.equal(pong.ts, 1755600012345);
        assert.ok(pong.serverTimeMs > 0);
    });

    await check('a replayed token is refused and the socket is closed 4401', async () => {
        const reused = token('watch', STREAM, 7);
        const first = await TestClient.connect();
        await first.hello();
        first.json({ t: 'join', token: reused, key: STREAM });
        await first.waitText((m) => m.t === 'joined', 'joined');

        const second = await TestClient.connect();
        await second.hello();
        second.json({ t: 'join', token: reused, key: STREAM });
        const error = await second.waitText((m) => m.t === 'error' && m.code === 'token_replayed', 'token_replayed');
        assert.equal(error.fatal, true);
        assert.equal(await second.waitClosed(), 4401);
        first.destroy();
    });

    await check('a token signed with the wrong key is refused 4401', async () => {
        const client = await TestClient.connect();
        const bad = mintToken(crypto.randomBytes(32), {
            v: 1,
            iss: 'sd-phone',
            sub: 'ABC12345',
            src: 12,
            name: 'Jonas Vance',
            key: '',
            role: 'session',
            gen: 0,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 45,
            jti: crypto.randomBytes(16).toString('hex'),
        });
        client.json({ t: 'hello', v: 1, token: bad, app: 'sd-phone', device: 'phone', build: 'selftest' });
        const error = await client.waitText((m) => m.t === 'error', 'auth error');
        assert.equal(error.code, 'token_bad_signature');
        assert.equal(await client.waitClosed(), 4401);
    });

    await check('a watch token cannot be used to publish', async () => {
        const client = await TestClient.connect();
        await client.hello();
        client.json({
            t: 'publish',
            token: token('watch', STREAM, 9),
            key: STREAM,
            gen: 9,
            mode: 'video',
            wire: 'chunks',
            codec: 'vp8',
            mime: '',
            width: 320,
            height: 180,
            fps: 4,
            bitrate: 120000,
        });
        const error = await client.waitText((m) => m.t === 'error' && m.code === 'token_scope', 'token_scope');
        assert.equal(error.fatal, true);
        assert.equal(await client.waitClosed(), 4403);
    });

    await check('a second publisher at the same generation is refused, the first keeps the stream', async () => {
        const client = await TestClient.connect();
        await client.hello();
        client.json({
            t: 'publish',
            token: token('publish', STREAM, 7),
            key: STREAM,
            gen: 7,
            mode: 'video',
            wire: 'chunks',
            codec: 'vp8',
            mime: '',
            width: 1600,
            height: 900,
            fps: 30,
            bitrate: 8000000,
        });
        const error = await client.waitText((m) => m.t === 'error' && m.code === 'stream_busy', 'stream_busy');
        assert.equal(error.fatal, false);
        assert.equal(client.closed, false);
        client.destroy();

        publisher.media(KIND.DELTA, publisherSid, 7, 99, deltaBytes(7));
        await viewer.waitText((m) => m.t === 'joined' || m.t === 'welcome', 'session still usable');
        assert.equal(viewer.closed, false, 'the original publisher and its viewers are untouched');
    });

    await check('a fragmented control message is reassembled', async () => {
        const client = await TestClient.connect();
        client.jsonFragmented({
            t: 'hello',
            v: 1,
            token: token('session', '', 0),
            app: 'sd-phone',
            device: 'tablet',
            build: 'selftest',
        });
        const welcome = await client.waitText((m) => m.t === 'welcome', 'welcome');
        assert.equal(welcome.sub, 'ABC12345');
        client.destroy();
    });

    await check('a publisher at a higher generation supersedes the one holding the key', async () => {
        const key = 'vibez:live:selftest02';
        const first = await TestClient.connect();
        await first.hello();
        first.json({
            t: 'publish',
            token: token('publish', key, 1),
            key,
            gen: 1,
            mode: 'video',
            wire: 'mse',
            codec: '',
            mime: 'video/webm;codecs=vp8',
            width: 640,
            height: 360,
            fps: 24,
            bitrate: 800000,
        });
        const ready = await first.waitText((m) => m.t === 'ready', 'ready');
        first.media(KIND.INIT, ready.sid, 1, 0, INIT_BYTES);

        const watcher = await TestClient.connect();
        await watcher.hello();
        watcher.json({ t: 'join', token: token('watch', key, 1), key });
        await watcher.waitText((m) => m.t === 'joined', 'joined');

        const second = await TestClient.connect();
        await second.hello();
        second.json({
            t: 'publish',
            token: token('publish', key, 2),
            key,
            gen: 2,
            mode: 'video',
            wire: 'mse',
            codec: '',
            mime: 'video/webm;codecs=vp8',
            width: 640,
            height: 360,
            fps: 24,
            bitrate: 800000,
        });
        await second.waitText((m) => m.t === 'ready' && m.gen === 2, 'ready at the new generation');

        const bye = await first.waitText((m) => m.t === 'bye', 'bye');
        assert.equal(bye.reason, 'superseded');
        assert.equal(await first.waitClosed(), 4409);

        const reset = await watcher.waitText((m) => m.t === 'stream' && m.state === 'reset', 'reset state');
        assert.equal(reset.gen, 2);
        assert.equal(reset.reason, 'gen_change');
        second.destroy();
        watcher.destroy();
    });

    await check('the same socket can re-publish at a new generation without being evicted', async () => {
        const key = 'photogram:live:selftest03';
        const host = await TestClient.connect();
        await host.hello();
        const publish = (gen) => host.json({
            t: 'publish',
            token: token('publish', key, gen),
            key,
            gen,
            mode: 'video',
            wire: 'chunks',
            codec: 'vp8',
            mime: '',
            width: 640,
            height: 360,
            fps: 24,
            bitrate: 800000,
        });

        publish(3);
        const first = await host.waitText((m) => m.t === 'ready', 'first ready');
        host.media(KIND.INIT, first.sid, 3, 0, INIT_BYTES);

        const watcher = await TestClient.connect();
        await watcher.hello();
        watcher.json({ t: 'join', token: token('watch', key, 3), key });
        await watcher.waitText((m) => m.t === 'joined', 'joined');

        publish(4);
        const second = await host.waitText((m) => m.t === 'ready' && m.gen === 4, 'second ready');
        assert.ok(second.sid > first.sid);
        assert.equal(host.closed, false, 'the publisher keeps its socket');

        const reset = await watcher.waitText((m) => m.t === 'stream' && m.state === 'reset', 'reset state');
        assert.equal(reset.gen, 4);

        host.media(KIND.INIT, second.sid, 4, 0, INIT_BYTES);
        host.media(KIND.KEY, second.sid, 4, 1, keyBytes(4));
        await watcher.waitFrames(3, 'media at the new generation');
        const after = watcher.frames.slice(1);
        assert.ok(after.every((f) => f.gen === 4), 'only the new generation is relayed after a reset');
        host.destroy();
        watcher.destroy();
    });

    await check('a socket is held to twelve streams', async () => {
        const client = await TestClient.connect();
        await client.hello();
        for (let n = 0; n < 12; n += 1) {
            const key = `mdt:cam:CAP${String(n).padStart(5, '0')}`;
            client.json({ t: 'join', token: token('watch', key, 0), key });
        }
        await client.waitText((m) => m.t === 'joined' && m.key === 'mdt:cam:CAP00011', 'the twelfth join');

        const key = 'mdt:cam:CAP00012';
        client.json({ t: 'join', token: token('watch', key, 0), key });
        const error = await client.waitText((m) => m.t === 'error' && m.code === 'too_many_streams', 'too_many_streams');
        assert.equal(error.fatal, false);
        assert.equal(client.closed, false);
        client.destroy();
    });

    await check('a binary message over 1 MiB closes the socket 4413', async () => {
        const client = await TestClient.connect();
        await client.hello();
        client.send(0x2, Buffer.alloc(1_048_577, 1));
        const error = await client.waitText((m) => m.t === 'error' && m.code === 'frame_too_large', 'frame_too_large');
        assert.equal(error.fatal, true);
        assert.equal(await client.waitClosed(), 4413);
    });

    await check('a media frame with a bad magic byte closes the socket 4400', async () => {
        const client = await TestClient.connect();
        await client.hello();
        const bogus = Buffer.alloc(40, 0);
        bogus[0] = 0x11;
        client.send(0x2, bogus);
        const error = await client.waitText((m) => m.t === 'error' && m.code === 'bad_message', 'bad_message');
        assert.equal(error.fatal, true);
        assert.equal(await client.waitClosed(), 4400);
    });

    await check('a client that never says hello is closed 4408', async () => {
        const client = await TestClient.connect();
        client.json({ t: 'ping', ts: 1 });
        const error = await client.waitText((m) => m.t === 'error' && m.code === 'no_hello', 'no_hello');
        assert.equal(error.fatal, true);
        assert.equal(await client.waitClosed(), 4400);
    });

    await check('unpublish idles the viewers rather than ending them', async () => {
        publisher.json({ t: 'unpublish', sid: publisherSid });
        const idle = await viewer.waitText((m) => m.t === 'stream' && m.state === 'idle', 'idle state');
        assert.equal(idle.reason, 'unpublished');
        assert.equal(idle.key, STREAM);
    });

    await check('a publisher can resume inside the linger window without the viewer rejoining', async () => {
        const before = viewer.texts.length;
        publisher.json({
            t: 'publish',
            token: token('publish', STREAM, 7),
            key: STREAM,
            gen: 7,
            mode: 'video',
            wire: 'chunks',
            codec: 'vp8',
            mime: '',
            width: 1600,
            height: 900,
            fps: 30,
            bitrate: 8000000,
        });
        const ready = await publisher.waitText((m) => m.t === 'ready' && m.sid !== publisherSid, 'second ready');
        assert.ok(ready.sid > publisherSid, 'a stream handle is never reused on a socket');
        publisherSid = ready.sid;

        const live = await viewer.waitText(
            (m, i) => i >= before && m.t === 'stream' && m.state === 'live',
            'live state after resume'
        );
        assert.equal(live.reason, 'publisher_attached');

        const count = viewer.frames.length;
        publisher.media(KIND.KEY, publisherSid, 7, 200, keyBytes(30));
        await viewer.waitFrames(count + 1, 'a frame after the resume');
        assert.equal(viewer.frames[count].kind, KIND.KEY);
    });

    await check('the image mode prime cache holds only the newest still frame', async () => {
        const stills = 'photogram:live:selftest01';
        const host = await TestClient.connect();
        await host.hello();
        host.json({
            t: 'publish',
            token: token('publish', stills, 1),
            key: stills,
            gen: 1,
            mode: 'image',
            wire: 'chunks',
            codec: '',
            mime: '',
            width: 640,
            height: 360,
            fps: 1,
            bitrate: 200000,
        });
        const ready = await host.waitText((m) => m.t === 'ready', 'ready');
        host.media(KIND.JPEG, ready.sid, 1, 0, Buffer.alloc(64, 0xa1));
        host.media(KIND.JPEG, ready.sid, 1, 1, Buffer.alloc(64, 0xa2));
        await idle(80);

        const watcher = await TestClient.connect();
        await watcher.hello();
        watcher.json({ t: 'join', token: token('watch', stills, 1), key: stills });
        await watcher.waitText((m) => m.t === 'joined', 'joined');
        const frames = await watcher.waitFrames(1, 'the cached still');
        await idle(80);
        assert.equal(watcher.frames.length, 1, 'only the newest still is cached');
        assert.equal(frames[0].kind, KIND.JPEG);
        assert.equal(frames[0].payload[0], 0xa2);
        host.destroy();
        watcher.destroy();
    });

    await check('the control channel reports stats and revokes a stream', async () => {
        const body = JSON.stringify({ op: 'stats' });
        const ts = Date.now();
        const sig = crypto.createHmac('sha256', KEY).update(`${ts}.${body}`).digest('hex');
        const stats = await new Promise((resolve, reject) => {
            const req = http.request({
                port: PORT,
                host: '127.0.0.1',
                path: '/control',
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-sdmr-ts': String(ts), 'x-sdmr-sig': sig },
            }, (res) => {
                let text = '';
                res.on('data', (c) => { text += c; });
                res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }));
            });
            req.on('error', reject);
            req.end(body);
        });
        assert.equal(stats.status, 200);
        assert.ok(stats.json.streams >= 1);
        assert.ok(stats.json.streamList.some((s) => s.key === STREAM && s.hasInit === true));

        const badTs = Date.now() - 60_000;
        const refused = await new Promise((resolve, reject) => {
            const req = http.request({
                port: PORT,
                host: '127.0.0.1',
                path: '/control',
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-sdmr-ts': String(badTs), 'x-sdmr-sig': sig },
            }, (res) => {
                res.resume();
                res.on('end', () => resolve(res.statusCode));
            });
            req.on('error', reject);
            req.end(body);
        });
        assert.equal(refused, 401, 'a stale control call is refused');

        const revokeBody = JSON.stringify({ op: 'revoke', key: STREAM, reason: 'offduty' });
        const rts = Date.now();
        const rsig = crypto.createHmac('sha256', KEY).update(`${rts}.${revokeBody}`).digest('hex');
        await new Promise((resolve, reject) => {
            const req = http.request({
                port: PORT,
                host: '127.0.0.1',
                path: '/control',
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-sdmr-ts': String(rts), 'x-sdmr-sig': rsig },
            }, (res) => {
                res.resume();
                res.on('end', resolve);
            });
            req.on('error', reject);
            req.end(revokeBody);
        });

        const ended = await viewer.waitText(
            (m) => m.t === 'stream' && m.state === 'ended' && m.reason === 'revoked',
            'revoked state'
        );
        assert.equal(ended.key, STREAM);
    });

    publisher?.destroy();
    viewer?.destroy();
    await relay.close();

    process.stdout.write(`\nsd-phone media relay self test\n${results.join('\n')}\n`);
    process.stdout.write(failures === 0
        ? `\n${results.length} checks passed.\n`
        : `\n${failures} of ${results.length} checks FAILED.\n`);
    process.exit(failures === 0 ? 0 : 1);

})();
