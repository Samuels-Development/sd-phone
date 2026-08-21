// Clause 12.2: relay environment. Everything the process needs is read once at start so a bad
// value fails loudly at boot rather than on the first player who tries to watch a camera.

const HEX64 = /^[0-9a-f]{64}$/;

function intEnv(raw, fallback, min, max) {
    const n = Number.parseInt(String(raw ?? '').trim(), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function loadConfig(env = process.env) {
    const errors = [];

    const keyHex = String(env.SD_PHONE_RELAY_KEY ?? '').trim();
    if (!keyHex) {
        errors.push('SD_PHONE_RELAY_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    } else if (!HEX64.test(keyHex)) {
        errors.push('SD_PHONE_RELAY_KEY must be exactly 64 lowercase hex characters (32 bytes).');
    }

    const origins = String(env.SD_PHONE_RELAY_ORIGIN ?? 'https://cfx-nui-sd-phone,https://cfx-nui-sd-tablet')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s !== '');

    const tlsCert = String(env.SD_PHONE_RELAY_TLS_CERT ?? '').trim();
    const tlsKey = String(env.SD_PHONE_RELAY_TLS_KEY ?? '').trim();
    if ((tlsCert === '') !== (tlsKey === '')) {
        errors.push('SD_PHONE_RELAY_TLS_CERT and SD_PHONE_RELAY_TLS_KEY must both be set, or both be empty.');
    }

    const logLevel = String(env.SD_PHONE_RELAY_LOG ?? 'info').trim().toLowerCase();
    if (!['error', 'warn', 'info', 'debug'].includes(logLevel)) {
        errors.push(`SD_PHONE_RELAY_LOG must be one of error, warn, info, debug (got "${logLevel}").`);
    }

    return {
        errors,
        keyHex,
        key: HEX64.test(keyHex) ? Buffer.from(keyHex, 'hex') : Buffer.alloc(0),
        host: String(env.SD_PHONE_RELAY_HOST ?? '0.0.0.0').trim() || '0.0.0.0',
        port: intEnv(env.SD_PHONE_RELAY_PORT, 30567, 1, 65535),
        origins,
        anyOrigin: origins.includes('*'),
        tlsCert,
        tlsKey,
        maxSockets: intEnv(env.SD_PHONE_RELAY_MAX_SOCKETS, 512, 1, 100000),
        // Only set this when a reverse proxy you control terminates TLS in front of the relay:
        // an x-forwarded-for from a direct client is attacker-controlled and would let one player
        // spend another player's abuse budget.
        trustProxy: String(env.SD_PHONE_RELAY_TRUST_PROXY ?? '').trim() === '1',
        logLevel,
    };
}

module.exports = {
    loadConfig,
};
