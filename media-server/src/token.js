// Clause 3: token verification. Standalone by design: the relay never calls back into FiveM to
// validate anything, so everything needed to accept or refuse a token is inside the token and the
// shared HMAC key. The step order in verifyToken() is normative (clause 3.9) and no claim is
// inspected before the signature has been checked.

const crypto = require('node:crypto');

const { CLOCK_SKEW_S, MAX_TOKEN_CHARS, TOKEN_TTL_S_MAX } = require('./protocol.js');

const PREFIX = 'sdmr1';
const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const SUB_RE = /^[A-Za-z0-9_-]{1,64}$/;
const JTI_RE = /^[0-9a-f]{32}$/;
const ROLES = new Set(['session', 'publish', 'watch']);

const FIELDS = ['v', 'iss', 'sub', 'src', 'name', 'key', 'role', 'gen', 'iat', 'exp', 'jti'];

function b64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isInt(value, min, max) {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function signingInput(payloadPart) {
    return Buffer.from(`${PREFIX}.${payloadPart}`, 'ascii');
}

// Mints a token. FiveM does this through server/crypto.js in production; this exists so the relay
// can be exercised by selftest.js and by an owner debugging a deployment.
function mintToken(key, payload) {
    const json = JSON.stringify(payload);
    const part = b64url(Buffer.from(json, 'utf8'));
    const mac = crypto.createHmac('sha256', key).update(signingInput(part)).digest();
    return `${PREFIX}.${part}.${b64url(mac)}`;
}

function fieldsValid(payload) {
    const keys = Object.keys(payload);
    if (keys.length !== FIELDS.length) return false;
    for (const field of FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(payload, field)) return false;
    }

    if (payload.v !== 1) return false;
    if (payload.iss !== 'sd-phone') return false;
    if (typeof payload.sub !== 'string' || !SUB_RE.test(payload.sub)) return false;
    if (!isInt(payload.src, 1, 65535)) return false;
    if (typeof payload.name !== 'string' || payload.name.length > 64) return false;
    if (typeof payload.key !== 'string' || payload.key.length > 200) return false;
    if (typeof payload.role !== 'string' || !ROLES.has(payload.role)) return false;
    if (!isInt(payload.gen, 0, 2147483647)) return false;
    if (!isInt(payload.iat, 0, 4294967295)) return false;
    if (!isInt(payload.exp, 0, 4294967295)) return false;
    if (typeof payload.jti !== 'string' || !JTI_RE.test(payload.jti)) return false;

    if (payload.role === 'session' && (payload.key !== '' || payload.gen !== 0)) return false;
    return true;
}

// opts: { key: Buffer, role, streamKey, sub, jtiStore, now (unix seconds) }
// Returns { ok: true, payload } or { ok: false, code } with a code from clause 4.16.
function verifyToken(token, opts) {
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_CHARS) {
        return { ok: false, code: 'token_malformed' };
    }

    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, code: 'token_malformed' };
    if (!B64URL_RE.test(parts[1]) || !B64URL_RE.test(parts[2])) return { ok: false, code: 'token_malformed' };

    const want = crypto.createHmac('sha256', opts.key).update(signingInput(parts[1])).digest();
    let got;
    try {
        got = Buffer.from(parts[2], 'base64url');
    } catch {
        return { ok: false, code: 'token_malformed' };
    }
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
        return { ok: false, code: 'token_bad_signature' };
    }

    let payload;
    try {
        payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
        return { ok: false, code: 'token_malformed' };
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return { ok: false, code: 'token_malformed' };
    }
    if (!fieldsValid(payload)) return { ok: false, code: 'token_malformed' };

    const now = opts.now ?? Math.floor(Date.now() / 1000);
    if (payload.exp <= now - CLOCK_SKEW_S) return { ok: false, code: 'token_expired' };
    if (payload.iat > now + CLOCK_SKEW_S) return { ok: false, code: 'token_malformed' };
    if (payload.exp <= payload.iat) return { ok: false, code: 'token_malformed' };
    if (payload.exp - payload.iat > TOKEN_TTL_S_MAX) return { ok: false, code: 'token_malformed' };

    if (opts.jtiStore) {
        const state = opts.jtiStore.check(payload.jti);
        if (state === 'replay') return { ok: false, code: 'token_replayed' };
        if (state === 'full') return { ok: false, code: 'overloaded' };
    }

    if (payload.role !== opts.role) return { ok: false, code: 'token_scope' };
    if (payload.key !== (opts.streamKey ?? '')) return { ok: false, code: 'token_scope' };
    if (opts.sub !== undefined && payload.sub !== opts.sub) return { ok: false, code: 'token_scope' };

    if (opts.jtiStore) opts.jtiStore.remember(payload.jti, payload.exp);
    return { ok: true, payload };
}

module.exports = {
    mintToken,
    verifyToken,
};
