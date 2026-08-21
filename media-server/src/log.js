// Human-readable stdout logging. Tokens are never passed to this module: only stream keys,
// citizenids, reason codes and counters, all of which a server owner needs to read a log.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LABEL = { error: 'ERROR', warn: 'WARN ', info: 'INFO ', debug: 'DEBUG' };

function stamp() {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function render(fields) {
    if (!fields) return '';
    const parts = [];
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        const text = typeof value === 'string' ? value : String(value);
        parts.push(`${key}=${/[\s"]/.test(text) ? JSON.stringify(text) : text}`);
    }
    return parts.length ? ` ${parts.join(' ')}` : '';
}

function createLogger(level = 'info') {
    const threshold = LEVELS[level] ?? LEVELS.info;

    function emit(kind, scope, message, fields) {
        if (LEVELS[kind] > threshold) return;
        const line = `${stamp()} ${LABEL[kind]} [${scope}] ${message}${render(fields)}`;
        if (kind === 'error' || kind === 'warn') process.stderr.write(`${line}\n`);
        else process.stdout.write(`${line}\n`);
    }

    return {
        level,
        enabled: (kind) => (LEVELS[kind] ?? 99) <= threshold,
        error: (scope, message, fields) => emit('error', scope, message, fields),
        warn: (scope, message, fields) => emit('warn', scope, message, fields),
        info: (scope, message, fields) => emit('info', scope, message, fields),
        debug: (scope, message, fields) => emit('debug', scope, message, fields),
    };
}

module.exports = {
    createLogger,
};
