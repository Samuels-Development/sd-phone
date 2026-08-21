// Clause 3.10: replay defence. Entries are never evicted to make room, because evicting reopens
// the replay window; at the cap the relay refuses new tokens instead.

const { CLOCK_SKEW_S, JTI_MAX, JTI_SWEEP_MS } = require('./protocol.js');

class JtiStore {
    constructor() {
        this.seen = new Map();
        this.timer = setInterval(() => this.sweep(), JTI_SWEEP_MS);
        if (typeof this.timer.unref === 'function') this.timer.unref();
    }

    get size() {
        return this.seen.size;
    }

    // 'ok' when the jti is fresh, 'replay' when it has been used, 'full' when the store is at cap.
    check(jti) {
        if (this.seen.has(jti)) return 'replay';
        if (this.seen.size >= JTI_MAX) return 'full';
        return 'ok';
    }

    remember(jti, exp) {
        this.seen.set(jti, exp);
    }

    sweep() {
        const cutoff = Math.floor(Date.now() / 1000) - CLOCK_SKEW_S;
        for (const [jti, exp] of this.seen) {
            if (exp < cutoff) this.seen.delete(jti);
        }
    }

    dispose() {
        clearInterval(this.timer);
        this.seen.clear();
    }
}

module.exports = {
    JtiStore,
};
