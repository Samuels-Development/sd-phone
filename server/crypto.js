const crypto = require('node:crypto');

const RESOURCE = GetCurrentResourceName();
const SECRET_FILE = '.secret';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;

function loadSecret() {
    const convar = GetConvar('sd_phone_secret', '');
    if (convar && convar.trim() !== '') {
        return crypto.createHash('sha256').update(convar.trim(), 'utf8').digest();
    }

    const saved = LoadResourceFile(RESOURCE, SECRET_FILE);
    if (saved && /^[0-9a-f]{64}$/i.test(saved.trim())) {
        return Buffer.from(saved.trim(), 'hex');
    }

    const generated = crypto.randomBytes(32);
    SaveResourceFile(RESOURCE, SECRET_FILE, generated.toString('hex'), -1);
    console.log(
        '^3[sd-phone:crypto]^0 no `sd_phone_secret` convar set, so a server secret was generated ' +
        `into ${RESOURCE}/${SECRET_FILE}. Back this file up: losing it makes saved Passwords ` +
        'unreadable and forces every account through a password reset.'
    );
    return generated;
}

const SECRET = loadSecret();
const PEPPER = crypto.createHmac('sha256', SECRET).update('pepper').digest();
const VAULT_KEY = crypto.createHmac('sha256', SECRET).update('vault').digest();

function peppered(plain) {
    return Buffer.concat([Buffer.from(String(plain), 'utf8'), PEPPER]);
}

function hashPassword(plain) {
    const salt = crypto.randomBytes(SALT_LEN);
    const dk = crypto.scryptSync(peppered(plain), salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

function parseScrypt(stored) {
    if (typeof stored !== 'string') return null;
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
    const want = Buffer.from(parts[5], 'base64');
    if (want.length === 0) return null;
    return {
        salt: Buffer.from(parts[4], 'base64'),
        want,
        opts: { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) },
    };
}

function matches(dk, want) {
    return dk.length === want.length && crypto.timingSafeEqual(dk, want);
}

function verifyPassword(plain, stored) {
    const h = parseScrypt(stored);
    if (!h) return false;
    try {
        return matches(crypto.scryptSync(peppered(plain), h.salt, h.want.length, h.opts), h.want);
    } catch (err) {
        return false;
    }
}

// The same check on libuv's worker pool, so a burst of sign-ins never stalls the server thread.
// The Lua caller awaits the returned Promise; it always resolves, never rejects.
function verifyPasswordAsync(plain, stored) {
    const h = parseScrypt(stored);
    if (!h) return Promise.resolve(false);
    return new Promise((resolve) => {
        try {
            crypto.scrypt(peppered(plain), h.salt, h.want.length, h.opts, (err, dk) => {
                resolve(!err && matches(dk, h.want));
            });
        } catch (err) {
            resolve(false);
        }
    });
}

function encrypt(plain) {
    if (typeof plain !== 'string' || plain === '') return plain;
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `v1$${iv.toString('base64')}$${cipher.getAuthTag().toString('base64')}$${body.toString('base64')}`;
}

function decrypt(blob) {
    if (typeof blob !== 'string') return null;
    const parts = blob.split('$');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, Buffer.from(parts[1], 'base64'));
        decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
    } catch (err) {
        return null;
    }
}

// FiveM's JS runtime injects `exports` as the registration function; plain CommonJS binds it to
// the module's exports object instead. Resolving both keeps the file loadable off-server.
const registerExport = typeof exports === 'function' ? exports : global.exports;

// lb-phone hashed with bcrypt, which Node has no built-in for. Verifying it is what lets a
// migrated player sign in with the password they already know instead of being locked out of an
// account nobody recorded the owner of. Verify only: nothing here ever writes a bcrypt hash, and
// the accounts engine rewrites the account to scrypt the first time one is accepted.
let bcrypt = null;
try {
    bcrypt = require('./server/vendor/bcryptjs.js');
} catch (err) {
    console.log(`^3[sd-phone:crypto]^0 bcrypt helper did not load (${err.message}); lb-phone passwords cannot be verified.`);
}

const BCRYPT_RE = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function verifyBcrypt(plain, stored) {
    if (!bcrypt || typeof plain !== 'string' || typeof stored !== 'string') return false;
    if (!BCRYPT_RE.test(stored)) return false;
    try {
        return bcrypt.compareSync(plain, stored) === true;
    } catch (err) {
        return false;
    }
}

registerExport('sdCryptoReady', () => true);
registerExport('sdCryptoHashPassword', hashPassword);
registerExport('sdCryptoVerifyPassword', verifyPassword);
registerExport('sdCryptoVerifyPasswordAsync', verifyPasswordAsync);
registerExport('sdCryptoVerifyBcrypt', verifyBcrypt);
registerExport('sdCryptoEncrypt', encrypt);
registerExport('sdCryptoDecrypt', decrypt);
registerExport('sdCryptoSha256', (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'));
registerExport('sdCryptoRandomHex', (n) => crypto.randomBytes(Math.min(64, Math.max(1, Number(n) || 32))).toString('hex'));
// coturn's REST API credential: base64(HMAC-SHA1(shared secret, username)).
registerExport('sdCryptoHmacSha1Base64', (key, msg) => crypto.createHmac('sha1', String(key)).update(String(msg), 'utf8').digest('base64'));

// The relay token helpers. `server/media/tokens.lua` signs every grant through these, and
// `media-server/src/token.js` verifies what comes out, so the two implementations have to agree
// byte for byte: HMAC-SHA256 over the ASCII string `sdmr1.<base64url(claims)>`, with the raw
// signature bytes (not their hex) base64url'd as the third part.
const RELAY_KEY_RE = /^[0-9a-f]{64}$/;

function relayKey(keyHex) {
    return typeof keyHex === 'string' && RELAY_KEY_RE.test(keyHex) ? Buffer.from(keyHex, 'hex') : null;
}

function b64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

registerExport('sdCryptoHmacHex', (keyHex, msg) => {
    const key = relayKey(keyHex);
    if (!key || typeof msg !== 'string') return null;
    return crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex');
});

registerExport('sdCryptoRelayToken', (keyHex, payloadJson) => {
    const key = relayKey(keyHex);
    if (!key || typeof payloadJson !== 'string' || payloadJson === '') return null;
    const part = b64url(Buffer.from(payloadJson, 'utf8'));
    const mac = crypto.createHmac('sha256', key).update(`sdmr1.${part}`, 'utf8').digest();
    return `sdmr1.${part}.${b64url(mac)}`;
});
