#!/usr/bin/env node
(async () => {
    // sd-phone media relay (SDMR/1). Run with `node index.js`.
    //
    // This process is NOT a FiveM resource. It is never listed in fxmanifest.lua, it calls no native
    // and it never talks to the game server except to answer the optional control endpoint. It carries
    // binary media between phones: a publisher pushes encoded frames, viewers get them fanned out.

    const { loadConfig } = require('./src/config.js');
    const { createLogger } = require('./src/log.js');
    const { createRelay } = require('./src/relay.js');

    const config = loadConfig(process.env);
    const log = createLogger(config.logLevel === undefined ? 'info' : config.logLevel);

    if (config.errors.length > 0) {
        for (const message of config.errors) log.error('boot', message);
        log.error('boot', 'refusing to start. See media-server/README.md for the full environment list.');
        process.exit(1);
    }

    const relay = createRelay(config, log);

    await relay.listen();

    const scheme = config.tlsCert ? 'wss' : 'ws';
    log.info('boot', 'media relay listening', {
        url: `${scheme}://${config.host}:${config.port}`,
        tls: config.tlsCert ? 'built in' : 'none (expects a terminator in front)',
        origins: config.origins.join(' '),
        maxSockets: config.maxSockets,
        logLevel: config.logLevel,
    });
    if (!config.tlsCert) {
        log.info('boot', 'the phone can only reach a wss:// endpoint, so put this behind TLS unless you are testing on loopback');
        if (!config.trustProxy) {
            // Something is terminating TLS in front, so every client arrives wearing the proxy's
            // address. The per-IP abuse counter would then pool the whole server into one bucket and
            // ban everybody the moment any single player trips it.
            log.warn('boot', 'no built-in TLS and SD_PHONE_RELAY_TRUST_PROXY is not set. If a reverse proxy is terminating TLS in front, set it to 1: without it every client arrives wearing the proxy address, and one bad client rate-limits the whole server. Ignore this if nothing is in front (plain ws on loopback).');
        }
    }

    let stopping = false;
    async function stop(signal) {
        if (stopping) return;
        stopping = true;
        log.info('boot', 'shutting down', { signal });
        await relay.close();
        process.exit(0);
    }

    process.on('SIGINT', () => { stop('SIGINT'); });
    process.on('SIGTERM', () => { stop('SIGTERM'); });
    process.on('uncaughtException', (err) => {
        log.error('boot', 'uncaught exception', { error: err.message, stack: err.stack });
    });
    process.on('unhandledRejection', (err) => {
        log.error('boot', 'unhandled rejection', { error: err instanceof Error ? err.message : String(err) });
    });

})();
