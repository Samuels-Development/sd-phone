---@type table Crypto module; the table returned at end of file.
local crypto = {}

---@type string This resource's name, used to reach the Node helper's exports.
local RESOURCE = GetCurrentResourceName()

---@type boolean|nil Cached result of the helper probe; nil until first use.
local ready

---Calls one of the Node helper's exports, swallowing a missing runtime.
---@param name string export name
---@param ... any arguments
---@return boolean okCall, any result
local function call(name, ...)
    return pcall(function(...) return exports[RESOURCE][name](exports[RESOURCE], ...) end, ...)
end

---True when the Node crypto helper answered. Probed once, then cached; a miss is announced so a
---server on a runtime without it is not silently left on the legacy hash.
---@return boolean available
function crypto.available()
    if ready == nil then
        local okCall, res = call('sdCryptoReady')
        ready = okCall and res == true
        if not ready then
            print('^1[sd-phone:crypto]^0 Node crypto helper did not load. Passwords stay on the legacy hash and saved Passwords stay unencrypted.')
        end
    end
    return ready
end

---Hashes a password with scrypt. Nil when the helper is unavailable.
---@param plain string plaintext password
---@return string|nil hash
function crypto.hashPassword(plain)
    if not crypto.available() then return nil end
    local okCall, res = call('sdCryptoHashPassword', plain)
    return (okCall and type(res) == 'string') and res or nil
end

---Checks a plaintext password against a scrypt hash. From a thread that can yield (every
---callback, event handler and CreateThread) the hash runs on Node's worker pool and only this
---thread waits for it, so a burst of sign-ins no longer stalls the whole server; FiveM awaits the
---Promise the async export returns. Anywhere that cannot yield, such as a file's main chunk, it
---falls back to the synchronous hash rather than failing the check.
---@param plain string plaintext password
---@param stored string stored scrypt hash
---@return boolean verified
function crypto.verifyPassword(plain, stored)
    if not crypto.available() then return false end
    local name = coroutine.isyieldable() and 'sdCryptoVerifyPasswordAsync' or 'sdCryptoVerifyPassword'
    local okCall, res = call(name, plain, stored)
    return okCall and res == true
end

---Checks a plaintext password against an lb-phone bcrypt hash. Only ever used to let a migrated
---account through on the password its owner already knows; the caller rewrites the account to
---scrypt as soon as one is accepted, so this path retires itself as players sign in.
---@param plain string plaintext password
---@param stored string stored bcrypt hash
---@return boolean verified
function crypto.verifyBcrypt(plain, stored)
    if not crypto.available() then return false end
    local okCall, res = call('sdCryptoVerifyBcrypt', plain, stored)
    return okCall and res == true
end

---Encrypts a vault secret. Nil when the helper is unavailable.
---@param plain string
---@return string|nil blob
function crypto.encrypt(plain)
    if not crypto.available() then return nil end
    local okCall, res = call('sdCryptoEncrypt', plain)
    return (okCall and type(res) == 'string') and res or nil
end

---Decrypts a vault secret. Nil when the helper is unavailable or the blob is not ours.
---@param blob string
---@return string|nil plain
function crypto.decrypt(blob)
    if not crypto.available() then return nil end
    local okCall, res = call('sdCryptoDecrypt', blob)
    return (okCall and type(res) == 'string') and res or nil
end

---Hashes an arbitrary string with SHA-256, lowercase hex. Nil when the helper is unavailable, so
---a caller that needs a verifiable commitment can degrade openly instead of publishing a fake one.
---@param s string value to hash
---@return string|nil hex 64 lowercase hex characters
function crypto.sha256(s)
    if not crypto.available() then return nil end
    local okCall, res = call('sdCryptoSha256', s)
    return (okCall and type(res) == 'string') and res or nil
end

---Cryptographically strong random bytes as lowercase hex. Nil when the helper is unavailable.
---@param bytes integer byte count, clamped to 1..64 by the helper
---@return string|nil hex 2 * bytes lowercase hex characters
function crypto.randomHex(bytes)
    if not crypto.available() then return nil end
    local okCall, res = call('sdCryptoRandomHex', bytes)
    return (okCall and type(res) == 'string') and res or nil
end

---HMAC-SHA1 of `msg` under `key`, base64. Nil when the helper is unavailable.
---@param key string
---@param msg string
---@return string|nil b64
function crypto.hmacSha1Base64(key, msg)
    if not crypto.available() then return nil end
    local okCall, res = call('sdCryptoHmacSha1Base64', key, msg)
    return (okCall and type(res) == 'string') and res or nil
end

return crypto
