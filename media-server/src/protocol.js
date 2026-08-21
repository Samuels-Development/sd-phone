// SDMR/1 wire constants. Clause numbers refer to the sd-phone Media Relay Protocol Specification.

const PROTOCOL_NAME = 'SDMR';
const WIRE_VERSION = 1;
const SUBPROTOCOL = 'sdphone-media-v1';

// Clause 2: binary media frame layout.
const SDMR_HEADER_BYTES = 24;
const MAGIC = 0xa7;
const VERSION = 0x01;

const KIND = { INIT: 0x01, KEY: 0x02, DELTA: 0x03, JPEG: 0x04 };
const KIND_NAME = { 1: 'INIT', 2: 'KEY', 3: 'DELTA', 4: 'JPEG' };

const FLAG = { REPLAY: 0x01, DISCONTINUITY: 0x02, LAST: 0x04 };
const FLAG_MASK = FLAG.REPLAY | FLAG.DISCONTINUITY | FLAG.LAST;

// Clause 13: constant reference.
const MAX_MESSAGE_BYTES = 1_048_576;
const MAX_CONTROL_BYTES = 8_192;
const MAX_TOKEN_CHARS = 1_024;
const MAX_STREAMS_PER_SOCKET = 12;
const MAX_STREAMS_GLOBAL = 256;

const HELLO_TIMEOUT_MS = 5_000;
const RELAY_PING_MS = 15_000;
const SOCKET_IDLE_MS = 30_000;

const CLOCK_SKEW_S = 5;
const TOKEN_TTL_S_MAX = 120;
const JTI_SWEEP_MS = 10_000;
const JTI_MAX = 100_000;
const AUTH_FAIL_MAX = 20;
const AUTH_FAIL_WINDOW_MS = 60_000;
const AUTH_BAN_MS = 300_000;

const PRIME_MAX_GOPS = 2;
const PRIME_MAX_FRAMES = 300;
const PRIME_MAX_BYTES = 8_388_608;
const PRIME_MAX_AGE_MS = 30_000;
const LINGER_MS = 10_000;

const SOFT_LIMIT = 1_048_576;
const HARD_LIMIT = 4_194_304;
const CONTROL_HEADROOM = 1_048_576;
const SLOW_VIEWER_MS = 5_000;
const INGEST_WINDOW_MS = 1_000;
const INGEST_MAX_BYTES_CEIL = 4_194_304;
const INGEST_OVER_WINDOWS_MAX = 3;
const INGEST_ERROR_MS = 2_000;

const KEYFRAME_REQUEST_MS = 1_000;
const VIEWERS_COALESCE_MS = 500;
const DROP_REPORT_MS = 2_000;

const CONTROL_SKEW_MS = 30_000;

// Clause 4.19: close codes.
const CLOSE = {
    NORMAL: 1000,
    GOING_AWAY: 1001,
    PROTOCOL: 4400,
    AUTH: 4401,
    SCOPE: 4403,
    TIMEOUT: 4408,
    DUPLICATE: 4409,
    TOO_LARGE: 4413,
    RATE_LIMITED: 4429,
    INTERNAL: 4500,
};

// Clause 5.1: stream key grammar.
const STREAM_KEY_RE = /^(mdt|photogram|vibez):(cam|live):[A-Za-z0-9_-]{1,64}$/;

const MODES = new Set(['video', 'image']);
const WIRES = new Set(['chunks', 'mse']);

module.exports = {
    PROTOCOL_NAME,
    WIRE_VERSION,
    SUBPROTOCOL,
    SDMR_HEADER_BYTES,
    MAGIC,
    VERSION,
    KIND,
    KIND_NAME,
    FLAG,
    FLAG_MASK,
    MAX_MESSAGE_BYTES,
    MAX_CONTROL_BYTES,
    MAX_TOKEN_CHARS,
    MAX_STREAMS_PER_SOCKET,
    MAX_STREAMS_GLOBAL,
    HELLO_TIMEOUT_MS,
    RELAY_PING_MS,
    SOCKET_IDLE_MS,
    CLOCK_SKEW_S,
    TOKEN_TTL_S_MAX,
    JTI_SWEEP_MS,
    JTI_MAX,
    AUTH_FAIL_MAX,
    AUTH_FAIL_WINDOW_MS,
    AUTH_BAN_MS,
    PRIME_MAX_GOPS,
    PRIME_MAX_FRAMES,
    PRIME_MAX_BYTES,
    PRIME_MAX_AGE_MS,
    LINGER_MS,
    SOFT_LIMIT,
    HARD_LIMIT,
    CONTROL_HEADROOM,
    SLOW_VIEWER_MS,
    INGEST_WINDOW_MS,
    INGEST_MAX_BYTES_CEIL,
    INGEST_OVER_WINDOWS_MAX,
    INGEST_ERROR_MS,
    KEYFRAME_REQUEST_MS,
    VIEWERS_COALESCE_MS,
    DROP_REPORT_MS,
    CONTROL_SKEW_MS,
    CLOSE,
    STREAM_KEY_RE,
    MODES,
    WIRES,
};
