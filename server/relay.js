// Runs the media relay inside this resource, so a server that wants one does not have to install
// Node, keep a second process alive, mint a signing key or match a port. The relay itself is
// unchanged: this file starts the same code media-server/index.js starts, with a configuration
// built here instead of read from the environment.
//
// It is opt-in and it is not the only way to run one. A large server can still run media-server/
// on its own box and point sd_phone_relay_url at it; that path is untouched.

const relayNet = require('node:net');

// Loaded on first use rather than at parse time. A require that throws up here takes the whole
// file with it, exports and all, and the failure then looks like the runtime never answered
// instead of like the relay core not loading.
let relayCoreCache = null;
function relayCore() {
    if (relayCoreCache) return relayCoreCache;
    relayCoreCache = {
        loadConfig: require('./media-server/src/config.js').loadConfig,
        createLogger: require('./media-server/src/log.js').createLogger,
        createRelay: require('./media-server/src/relay.js').createRelay,
    };
    return relayCoreCache;
}

// FiveM's JS runtime injects `exports` as the registration function; plain CommonJS binds it to
// the module's exports object instead. Resolving both keeps the file loadable off-server.
const relayRegister = typeof exports === 'function' ? exports : global.exports;

const RELAY_RESOURCE = GetCurrentResourceName();

// Well clear of the game port and the HTTP endpoint FiveM opens ten above it, which is what the
// relay's own default of 30130 collides with on a stock server.
const RELAY_PORT_BASE = 30567;
const RELAY_PORT_TRIES = 16;

let relayInstance = null;
let relayRunning = 0;

/** Whether anything already holds a port on this machine. */
function relayPortFree(port) {
    return new Promise(resolve => {
        const probe = relayNet.createServer();
        probe.once('error', () => resolve(false));
        probe.once('listening', () => probe.close(() => resolve(true)));
        probe.listen(port, '0.0.0.0');
    });
}

/**
 * The first free port at or after the base, skipping any the caller says are spoken for. A server
 * owner should not have to know that FiveM holds two ports and that one of them is where the
 * relay's documented default lands.
 */
async function relayPickPort(from, avoid) {
    const taken = new Set((avoid || []).map(Number).filter(Number.isFinite));
    for (let i = 0; i < RELAY_PORT_TRIES; i++) {
        const port = from + i;
        if (taken.has(port)) continue;
        if (await relayPortFree(port)) return port;
    }
    return 0;
}

/**
 * Starts the relay and reports back over an event rather than a return value, because binding a
 * port is asynchronous and the Lua side has nothing to do until it is bound.
 *
 * @param {object} opts { keyHex, port, origins, logLevel, tlsCert, tlsKey }
 */
async function relayStart(opts) {
    if (relayInstance) return;

    const wanted = Number(opts && opts.port) || 0;
    const port = wanted > 0 ? ((await relayPortFree(wanted)) ? wanted : 0) : await relayPickPort(RELAY_PORT_BASE, opts && opts.avoid);
    if (!port) {
        emit('sd-phone:media:relayHosted', { ok: false, reason: wanted > 0 ? 'port_taken' : 'no_free_port', port: wanted });
        return;
    }

    let loadConfig, createLogger, createRelay;
    try {
        ({ loadConfig, createLogger, createRelay } = relayCore());
    } catch (err) {
        emit('sd-phone:media:relayHosted', { ok: false, reason: 'core', detail: err && err.message });
        return;
    }

    const config = loadConfig({
        SD_PHONE_RELAY_KEY:      String((opts && opts.keyHex) || ''),
        SD_PHONE_RELAY_PORT:     String(port),
        SD_PHONE_RELAY_HOST:     '0.0.0.0',
        SD_PHONE_RELAY_ORIGIN:   String((opts && opts.origins) || 'https://cfx-nui-sd-phone,https://cfx-nui-sd-tablet'),
        SD_PHONE_RELAY_LOG:      String((opts && opts.logLevel) || 'warn'),
        SD_PHONE_RELAY_TLS_CERT: String((opts && opts.tlsCert) || ''),
        SD_PHONE_RELAY_TLS_KEY:  String((opts && opts.tlsKey) || ''),
        // TLS is terminated in front of an in-process relay or not at all, and either way the
        // address a client arrives with is the one to count against.
        SD_PHONE_RELAY_TRUST_PROXY: (opts && opts.trustProxy) ? '1' : '',
    });

    if (config.errors.length > 0) {
        emit('sd-phone:media:relayHosted', { ok: false, reason: 'config', detail: config.errors[0] });
        return;
    }

    const log = createLogger(config.logLevel === undefined ? 'warn' : config.logLevel);
    const started = createRelay(config, log);
    try {
        await started.listen();
    } catch (err) {
        emit('sd-phone:media:relayHosted', { ok: false, reason: 'listen', detail: err && err.message });
        return;
    }

    relayInstance = started;
    relayRunning = port;
    emit('sd-phone:media:relayHosted', { ok: true, port, tls: config.tlsCert !== '' });
}

async function relayStop() {
    const open = relayInstance;
    relayInstance = null;
    relayRunning = 0;
    if (!open) return;
    try {
        await open.close();
    } catch { /* already down */ }
}

relayRegister('sdRelayHost', (opts) => { void relayStart(opts || {}); return true; });
relayRegister('sdRelayPort', () => relayRunning);

on('onResourceStop', (name) => {
    if (name === RELAY_RESOURCE) void relayStop();
});
