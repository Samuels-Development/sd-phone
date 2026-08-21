// The process-wide registry: every socket, every stream, the replay defence and the per IP abuse
// counter (clause 3.12), plus the two housekeeping sweeps clause 1.9 requires.

const { JtiStore } = require('./jti.js');
const { AUTH_BAN_MS, AUTH_FAIL_MAX, AUTH_FAIL_WINDOW_MS, CLOSE, RELAY_PING_MS, SOCKET_IDLE_MS } = require('./protocol.js');
const { Stream } = require('./stream.js');

const SWEEP_MS = 2_500;

class Hub {
    constructor(config, log) {
        this.config = config;
        this.log = log;
        this.jti = new JtiStore();
        this.streams = new Map();
        this.sessions = new Set();
        this.authFails = new Map();
        this.startedAt = Date.now();
        this.upgrades = 0;
        this.rejected = 0;

        this.pingTimer = setInterval(() => this.pingAll(), RELAY_PING_MS);
        this.sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
        for (const timer of [this.pingTimer, this.sweepTimer]) {
            if (typeof timer.unref === 'function') timer.unref();
        }
    }

    addSession(session) {
        this.sessions.add(session);
    }

    removeSession(session) {
        this.sessions.delete(session);
    }

    getStream(key) {
        return this.streams.get(key) ?? null;
    }

    createStream(key) {
        const stream = new Stream(this, key);
        this.streams.set(key, stream);
        return stream;
    }

    removeStream(stream) {
        if (this.streams.get(stream.key) === stream) this.streams.delete(stream.key);
    }

    // Clause 3.12: a rolling 60 s counter of auth failures per source IP.
    recordAuthFailure(ip) {
        const now = Date.now();
        let entry = this.authFails.get(ip);
        if (!entry || now - entry.windowStart > AUTH_FAIL_WINDOW_MS) {
            entry = { windowStart: now, count: 0, bannedUntil: 0 };
            this.authFails.set(ip, entry);
        }
        entry.count += 1;
        if (entry.count >= AUTH_FAIL_MAX && entry.bannedUntil < now) {
            entry.bannedUntil = now + AUTH_BAN_MS;
            this.log.warn('auth', 'refusing upgrades from this address for 5 minutes', { ip, failures: entry.count });
        }
    }

    bannedUntil(ip) {
        const entry = this.authFails.get(ip);
        if (!entry) return 0;
        return entry.bannedUntil > Date.now() ? entry.bannedUntil : 0;
    }

    pingAll() {
        for (const session of this.sessions) {
            if (!session.closed) session.ws.ping();
        }
    }

    // Clause 1.9: a socket that has sent nothing at all for 30 s is gone whatever TCP thinks.
    sweep() {
        const now = Date.now();
        for (const session of [...this.sessions]) {
            if (session.closed) continue;
            if (now - session.ws.lastRecvAt > SOCKET_IDLE_MS) {
                this.log.debug('socket', 'idle timeout', { ip: session.ip, sub: session.sub || '-' });
                session.shutdown(CLOSE.TIMEOUT, 'idle_timeout');
            }
        }
        for (const [ip, entry] of this.authFails) {
            if (entry.bannedUntil < now && now - entry.windowStart > AUTH_FAIL_WINDOW_MS) this.authFails.delete(ip);
        }
    }

    // Clause 3.13: out of band revocation from the game server.
    revoke(key, reason) {
        const stream = this.streams.get(key);
        if (!stream) return false;
        this.log.info('control', 'stream revoked', { key, reason: reason || '-' });
        stream.broadcastState('ended', 'revoked');
        stream.destroy('revoked');
        return true;
    }

    forceGen(key, gen) {
        const stream = this.streams.get(key);
        if (!stream) return false;
        if (gen <= stream.gen) return false;
        stream.resetGen(gen, 'gen_change');
        return true;
    }

    health() {
        return {
            ok: true,
            streams: this.streams.size,
            sockets: this.sessions.size,
            uptimeMs: Date.now() - this.startedAt,
        };
    }

    stats() {
        return {
            ...this.health(),
            upgrades: this.upgrades,
            rejected: this.rejected,
            jti: this.jti.size,
            banned: [...this.authFails.values()].filter((e) => e.bannedUntil > Date.now()).length,
            streamList: [...this.streams.values()].map((s) => s.stats()),
        };
    }

    dispose() {
        clearInterval(this.pingTimer);
        clearInterval(this.sweepTimer);
        this.jti.dispose();
        for (const session of [...this.sessions]) session.shutdown(CLOSE.GOING_AWAY, 'shutdown');
        for (const stream of [...this.streams.values()]) stream.destroy('shutdown');
    }
}

module.exports = {
    Hub,
};
