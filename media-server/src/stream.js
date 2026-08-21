// Clause 5 (streams and the prime cache), clause 6 (backpressure) and clause 7 (publisher
// disappearance). One Stream instance exists per stream key for as long as anyone is attached to
// it plus the linger window.

const { encodeHeader, isSelfContained } = require('./frame.js');
const { CLOSE, DROP_REPORT_MS, FLAG, HARD_LIMIT, INGEST_ERROR_MS, INGEST_MAX_BYTES_CEIL, INGEST_OVER_WINDOWS_MAX, INGEST_WINDOW_MS, KEYFRAME_REQUEST_MS, KIND, LINGER_MS, PRIME_MAX_AGE_MS, PRIME_MAX_BYTES, PRIME_MAX_FRAMES, PRIME_MAX_GOPS, SLOW_VIEWER_MS, SOFT_LIMIT, VIEWERS_COALESCE_MS } = require('./protocol.js');

const DEFAULT_DESC = {
    mode: 'video',
    wire: '',
    codec: '',
    mime: '',
    width: 0,
    height: 0,
    fps: 0,
    bitrate: 0,
};

function clampBitrate(value) {
    const n = Number.isFinite(value) ? Math.floor(value) : 0;
    return Math.min(12000000, Math.max(1, n));
}

// One viewer's attachment to one stream. The pending queue is what makes clause 6.3 expressible:
// a frame the relay has decided to send but has not handed to the socket can still be discarded
// when a keyframe supersedes it.
class Viewer {
    constructor(stream, session, sid) {
        this.stream = stream;
        this.session = session;
        this.sid = sid;
        this.pending = [];
        this.pendingBytes = 0;
        this.gotInitGen = -1;
        this.pendingDiscontinuity = false;
        this.starvingSince = 0;
        this.dropFrames = 0;
        this.dropBytes = 0;
        this.dropSince = 0;
        this.lastDropReportAt = 0;
        this.detached = false;
        this.framesSent = 0;
    }

    queue(rec, flags, front) {
        const parts = [
            encodeHeader(rec.kind, flags, this.sid, rec.gen, rec.seq, rec.timestampUs),
            rec.payload,
        ];
        const item = { kind: rec.kind, parts, bytes: parts[0].length + rec.payload.length };
        if (front) this.pending.unshift(item);
        else this.pending.push(item);
        this.pendingBytes += item.bytes;
        this.session.pendingBytes += item.bytes;
    }

    // Clause 6.4: the current gen's INIT is queued ahead of all pending media for a viewer that
    // has not received it yet, and is never droppable.
    ensureInit() {
        const stream = this.stream;
        if (this.gotInitGen === stream.gen || !stream.init) return;
        this.queue(stream.init, FLAG.REPLAY, true);
        this.gotInitGen = stream.gen;
    }

    enqueue(rec, extraFlags) {
        let flags = (rec.flags & FLAG.LAST) | extraFlags;
        if (rec.kind === KIND.INIT) this.gotInitGen = this.stream.gen;
        else this.ensureInit();
        if (this.pendingDiscontinuity && isSelfContained(rec.kind)) {
            flags |= FLAG.DISCONTINUITY;
            this.pendingDiscontinuity = false;
        }
        this.queue(rec, flags, false);
        this.framesSent += 1;
        this.session.flush();
    }

    clearPending() {
        if (this.pending.length === 0) return;
        this.session.pendingBytes -= this.pendingBytes;
        this.pending.length = 0;
        this.pendingBytes = 0;
    }

    countDrop(rec) {
        const now = Date.now();
        if (this.dropSince === 0) this.dropSince = now;
        this.dropFrames += 1;
        this.dropBytes += rec.payload.length;
        if (now - this.lastDropReportAt < DROP_REPORT_MS) return;
        this.lastDropReportAt = now;
        this.session.sendJson({
            t: 'drop',
            sid: this.sid,
            frames: this.dropFrames,
            bytes: this.dropBytes,
            sinceMs: now - this.dropSince,
        });
        this.dropFrames = 0;
        this.dropBytes = 0;
        this.dropSince = 0;
    }

    // Clause 6.3, evaluated in the order the spec lists.
    push(rec, replay) {
        if (this.detached) return;
        const replayFlag = replay ? FLAG.REPLAY : 0;

        // Clause 6.5: an image stream holds at most one pending frame, always the newest.
        if (this.stream.desc.mode === 'image' && rec.kind === KIND.JPEG) this.clearPending();

        const load = this.session.load();
        if (load <= SOFT_LIMIT) {
            this.starvingSince = 0;
            this.enqueue(rec, replayFlag);
            return;
        }

        if (!isSelfContained(rec.kind)) {
            this.starvingSince = 0;
            this.pendingDiscontinuity = true;
            this.countDrop(rec);
            return;
        }

        if (load <= HARD_LIMIT) {
            this.starvingSince = 0;
            this.clearPending();
            this.pendingDiscontinuity = false;
            this.enqueue(rec, replayFlag | FLAG.DISCONTINUITY);
            return;
        }

        this.countDrop(rec);
        const now = Date.now();
        if (this.starvingSince === 0) this.starvingSince = now;
        if (now - this.starvingSince > SLOW_VIEWER_MS) this.stream.dropSlowViewer(this);
    }
}

class Stream {
    constructor(hub, key) {
        this.hub = hub;
        this.log = hub.log;
        this.key = key;
        this.gen = 0;
        this.desc = { ...DEFAULT_DESC };
        this.publisher = null;
        this.publisherSid = 0;
        this.established = false;
        this.viewers = new Set();
        this.init = null;
        this.gops = [];
        this.primeFrames = 0;
        this.primeBytes = 0;
        this.primeStale = false;
        this.lastJpeg = null;
        this.createdAt = Date.now();
        this.framesIn = 0;
        this.bytesIn = 0;
        this.lastFrameAt = 0;
        this.lastKeyframeReqAt = 0;
        this.lastIngestErrorAt = 0;
        this.ingestAt = Date.now();
        this.ingestBytes = 0;
        this.ingestOverWindows = 0;
        this.maxIngestBps = INGEST_MAX_BYTES_CEIL;
        this.viewersTimer = null;
        this.lingerTimer = null;
        this.destroyed = false;
    }

    get viewerCount() {
        return this.viewers.size;
    }

    descFields() {
        return {
            mode: this.desc.mode,
            wire: this.desc.wire,
            codec: this.desc.codec,
            mime: this.desc.mime,
            width: this.desc.width,
            height: this.desc.height,
            fps: this.desc.fps,
        };
    }

    // Clause 4.12.
    stateMessage(sid, state, reason) {
        return {
            t: 'stream',
            sid,
            key: this.key,
            gen: this.gen,
            state,
            reason,
            ...this.descFields(),
        };
    }

    broadcastState(state, reason) {
        for (const viewer of this.viewers) {
            viewer.session.sendJson(this.stateMessage(viewer.sid, state, reason));
        }
    }

    tellPublisher(message) {
        if (!this.publisher) return;
        this.publisher.sendJson(message);
    }

    // Clause 4.14: coalesced to at most one request per stream per second.
    requestKeyframe(reason) {
        if (!this.publisher) return;
        const now = Date.now();
        if (now - this.lastKeyframeReqAt < KEYFRAME_REQUEST_MS) return;
        this.lastKeyframeReqAt = now;
        this.tellPublisher({ t: 'keyframe', sid: this.publisherSid, reason });
    }

    // Clause 4.13: coalesced to at most one message per stream per 500 ms.
    scheduleViewers() {
        if (this.viewersTimer) return;
        this.viewersTimer = setTimeout(() => {
            this.viewersTimer = null;
            if (this.destroyed) return;
            const count = this.viewers.size;
            this.tellPublisher({ t: 'viewers', sid: this.publisherSid, viewers: count });
            for (const viewer of this.viewers) {
                viewer.session.sendJson({ t: 'viewers', sid: viewer.sid, viewers: count });
            }
        }, VIEWERS_COALESCE_MS);
        if (typeof this.viewersTimer.unref === 'function') this.viewersTimer.unref();
    }

    attachPublisher(session, sid, desc, gen) {
        const resumed = this.publisher === null && this.gen === gen && this.init !== null;
        if (this.lingerTimer) {
            clearTimeout(this.lingerTimer);
            this.lingerTimer = null;
        }

        this.publisher = session;
        this.publisherSid = sid;
        this.desc = { ...DEFAULT_DESC, ...desc };
        this.maxIngestBps = Math.min(3 * Math.floor(clampBitrate(desc.bitrate) / 8), INGEST_MAX_BYTES_CEIL);
        this.ingestAt = Date.now();
        this.ingestBytes = 0;
        this.ingestOverWindows = 0;

        // A stream nobody has ever published to has no media to fence off, so its first publisher
        // simply sets the epoch. Only a later change of epoch is a reset (clause 5.6).
        if (!this.established) {
            this.established = true;
            this.gen = gen;
        }

        if (gen !== this.gen) {
            this.resetGen(gen, 'gen_change');
        } else {
            this.broadcastState('live', 'publisher_attached');
            if (this.viewers.size > 0) {
                this.lastKeyframeReqAt = 0;
                this.requestKeyframe(resumed ? 'stale_prime' : 'viewer_join');
            }
        }

        // Clause 7.4: the relay's viewer count is only ever a hint to the publisher. The demand
        // gate that actually stops an encoder stays in Lua.
        if (this.viewers.size === 0) this.tellPublisher(this.stateMessage(sid, 'idle', 'no_viewers'));
        this.scheduleViewers();
        this.log.info('stream', resumed ? 'publisher resumed' : 'publisher attached', {
            key: this.key,
            gen: this.gen,
            sub: session.sub,
            wire: this.desc.wire,
            codec: this.desc.codec || this.desc.mime,
            viewers: this.viewers.size,
        });
    }

    // Clause 5.6, in the order the spec states.
    resetGen(gen, reason) {
        this.init = null;
        this.gops = [];
        this.primeFrames = 0;
        this.primeBytes = 0;
        this.lastJpeg = null;
        this.primeStale = false;
        this.gen = gen;
        for (const viewer of this.viewers) {
            viewer.clearPending();
            viewer.gotInitGen = -1;
            viewer.pendingDiscontinuity = false;
            viewer.session.sendJson(this.stateMessage(viewer.sid, 'reset', reason));
        }
        // No keyframe request here: a generation change IS the publisher re-anchoring, so its new
        // init and keyframe are already on their way. Asking again would anchor it a second time
        // and make every viewer rebuild twice for one quality change.
        this.lastKeyframeReqAt = 0;
        this.log.info('stream', 'generation reset', { key: this.key, gen, reason });
    }

    // Clause 7.2.
    detachPublisher(reason) {
        if (!this.publisher) return;
        this.publisher = null;
        this.publisherSid = 0;
        // Not 'ended': that is terminal to a viewer and makes it drop the stream. The whole point of
        // the linger below is that the publisher usually comes straight back, most often because a
        // quality change re-anchors it under a new generation. Telling viewers it ended here means
        // they leave during the re-anchor and the returning publisher finds an empty room, which the
        // player then reports as a dead feed after its silence timeout. Only the linger expiring is
        // an actual end.
        this.broadcastState('idle', reason);
        this.log.info('stream', 'publisher gone', { key: this.key, gen: this.gen, reason, viewers: this.viewers.size });

        if (this.lingerTimer) clearTimeout(this.lingerTimer);
        this.lingerTimer = setTimeout(() => {
            this.lingerTimer = null;
            this.broadcastState('ended', 'expired');
            this.destroy('expired');
        }, LINGER_MS);
        if (typeof this.lingerTimer.unref === 'function') this.lingerTimer.unref();
    }

    addViewer(session, sid) {
        const viewer = new Viewer(this, session, sid);
        this.viewers.add(viewer);
        this.scheduleViewers();
        return viewer;
    }

    removeViewer(viewer) {
        if (!this.viewers.delete(viewer)) return;
        viewer.detached = true;
        viewer.clearPending();
        this.scheduleViewers();
        if (this.publisher === null && this.viewers.size === 0 && !this.lingerTimer) this.destroy('no_viewers');
        if (this.publisher && this.viewers.size === 0) {
            this.tellPublisher(this.stateMessage(this.publisherSid, 'idle', 'no_viewers'));
        }
    }

    // Clause 6.3 rule 5.
    dropSlowViewer(viewer) {
        if (viewer.detached) return;
        viewer.session.sendJson({ t: 'error', code: 'too_slow', message: 'viewer too slow', sid: viewer.sid, fatal: false });
        viewer.session.sendJson(this.stateMessage(viewer.sid, 'ended', 'too_slow'));
        this.log.warn('stream', 'viewer detached, socket cannot keep up', {
            key: this.key,
            sub: viewer.session.sub,
            sid: viewer.sid,
        });
        const session = viewer.session;
        this.removeViewer(viewer);
        session.releaseStream(viewer.sid, true);
    }

    // Clause 5.7: the join sequence, in exactly this wire order.
    primeViewer(viewer) {
        const isImage = this.desc.mode === 'image';
        const prime = isImage ? this.lastJpeg : this.init;

        if (prime) {
            viewer.push(prime, true);
            if (!isImage) viewer.gotInitGen = this.gen;
        }
        if (!isImage && this.init && !this.primeStale) {
            for (const gop of this.gops) {
                for (const rec of gop.frames) viewer.push(rec, true);
            }
        }

        if (!this.publisher) {
            viewer.session.sendJson(this.stateMessage(viewer.sid, 'idle', 'publisher_gone'));
        } else if (!prime || this.primeStale) {
            this.requestKeyframe('viewer_join');
            viewer.session.sendJson(this.stateMessage(viewer.sid, 'priming', 'stale_prime'));
        } else {
            viewer.session.sendJson(this.stateMessage(viewer.sid, 'live', 'publisher_attached'));
        }
        this.requestKeyframe('viewer_join');
    }

    // Clause 6.7: 1000 ms sliding window with debt carry, the same shape as the Lua ingest budget.
    ingestOk(bytes) {
        const now = Date.now();
        const since = now - this.ingestAt;
        if (since < 0 || since >= INGEST_WINDOW_MS) {
            const debt = this.ingestBytes - this.maxIngestBps;
            this.ingestOverWindows = debt > 0 ? this.ingestOverWindows + 1 : 0;
            this.ingestAt = now;
            this.ingestBytes = debt > 0 ? debt : 0;
        }
        if (this.ingestBytes >= this.maxIngestBps) return false;
        this.ingestBytes += bytes;
        return true;
    }

    ingest(header, payload) {
        if (header.gen !== this.gen) return;

        if (!this.ingestOk(payload.length)) {
            const now = Date.now();
            if (now - this.lastIngestErrorAt >= INGEST_ERROR_MS) {
                this.lastIngestErrorAt = now;
                this.tellPublisher({
                    t: 'error',
                    code: 'ingest_over_budget',
                    message: 'ingest over budget',
                    sid: this.publisherSid,
                    fatal: false,
                });
            }
            if (this.ingestOverWindows >= INGEST_OVER_WINDOWS_MAX && this.publisher) {
                this.log.warn('stream', 'publisher over ingest budget', { key: this.key, limit: this.maxIngestBps });
                this.publisher.shutdown(CLOSE.RATE_LIMITED, 'ingest_over_budget');
            }
            return;
        }

        const rec = {
            kind: header.kind,
            flags: header.flags & FLAG.LAST,
            gen: header.gen,
            seq: header.seq,
            timestampUs: header.timestampUs,
            payload,
            at: Date.now(),
        };

        this.framesIn += 1;
        this.bytesIn += payload.length;
        this.lastFrameAt = rec.at;
        this.cache(rec);
        for (const viewer of [...this.viewers]) viewer.push(rec, false);
    }

    // Clause 5.3 and 5.5. A GOP is only ever stored, served or evicted whole.
    cache(rec) {
        if (this.desc.mode === 'image') {
            if (rec.kind === KIND.JPEG) this.lastJpeg = rec;
            else if (rec.kind === KIND.INIT) this.init = rec;
            return;
        }

        if (rec.kind === KIND.INIT) {
            this.init = rec;
            this.gops = [];
            this.primeFrames = 0;
            this.primeBytes = 0;
            this.primeStale = false;
            return;
        }

        if (rec.kind === KIND.KEY) {
            this.gops.push({ anchorAt: rec.at, frames: [rec], bytes: rec.payload.length });
            this.primeFrames += 1;
            this.primeBytes += rec.payload.length;
            this.primeStale = false;
        } else {
            const gop = this.gops[this.gops.length - 1];
            if (!gop) return;
            gop.frames.push(rec);
            gop.bytes += rec.payload.length;
            this.primeFrames += 1;
            this.primeBytes += rec.payload.length;
        }
        this.evict();
    }

    dropOldestGop() {
        const gop = this.gops.shift();
        if (!gop) return;
        this.primeFrames -= gop.frames.length;
        this.primeBytes -= gop.bytes;
    }

    overBounds() {
        const oldest = this.gops[0];
        if (!oldest) return false;
        return this.primeFrames > PRIME_MAX_FRAMES
            || this.primeBytes > PRIME_MAX_BYTES
            || Date.now() - oldest.anchorAt > PRIME_MAX_AGE_MS;
    }

    evict() {
        while (this.gops.length > PRIME_MAX_GOPS && this.gops.length > 1) this.dropOldestGop();
        while (this.overBounds() && this.gops.length > 1) this.dropOldestGop();

        if (this.gops.length === 1 && this.overBounds()) {
            this.gops = [];
            this.primeFrames = 0;
            this.primeBytes = 0;
            this.primeStale = true;
            this.log.debug('stream', 'prime cache over budget, dropped; init segment retained', { key: this.key });
        }
    }

    destroy(reason) {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.viewersTimer) clearTimeout(this.viewersTimer);
        if (this.lingerTimer) clearTimeout(this.lingerTimer);
        this.viewersTimer = null;
        this.lingerTimer = null;

        if (this.publisher) {
            const publisher = this.publisher;
            const sid = this.publisherSid;
            this.publisher = null;
            publisher.sendJson(this.stateMessage(sid, 'ended', reason === 'revoked' ? 'revoked' : 'expired'));
            publisher.releaseStream(sid, false);
        }
        for (const viewer of [...this.viewers]) {
            viewer.detached = true;
            viewer.clearPending();
            viewer.session.releaseStream(viewer.sid, false);
        }
        this.viewers.clear();
        this.init = null;
        this.gops = [];
        this.lastJpeg = null;
        this.hub.removeStream(this);
        this.log.info('stream', 'destroyed', { key: this.key, reason });
    }

    stats() {
        return {
            key: this.key,
            gen: this.gen,
            live: this.publisher !== null,
            viewers: this.viewers.size,
            mode: this.desc.mode,
            wire: this.desc.wire,
            framesIn: this.framesIn,
            bytesIn: this.bytesIn,
            primeFrames: this.primeFrames,
            primeBytes: this.primeBytes,
            primeStale: this.primeStale,
            hasInit: this.init !== null,
        };
    }
}

module.exports = {
    Stream,
};
