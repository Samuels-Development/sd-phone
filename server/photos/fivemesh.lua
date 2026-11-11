---@type table sd-phone config root: FiveMesh credentials stay in config.ApiKeys on the server.
local config = require 'configs.config'

---@type table FiveMesh CDN provider; shares the uploader callback contract with the other CDNs.
local fivemesh = {}

local UPLOAD_URL <const> = 'https://api.fivemesh.io/v1/objects/base64'
local CONVAR_KEY <const> = 'sd_fivemesh_cdn_key'
local TIMEOUT_MS <const> = 60000
local MAX_URL_BYTES <const> = 512

-- Keep a playable extension even when a caller omits a filename or supplies the wrong one.
local EXT_BY_MIME <const> = {
    ['image/jpeg'] = 'jpg', ['image/jpg'] = 'jpg', ['image/png'] = 'png',
    ['image/gif'] = 'gif', ['image/webp'] = 'webp',
    ['video/webm'] = 'webm', ['video/mp4'] = 'mp4', ['video/quicktime'] = 'mov',
    ['video/ogg'] = 'ogg', ['video/x-matroska'] = 'webm',
    ['audio/webm'] = 'webm', ['audio/ogg'] = 'ogg', ['audio/mp4'] = 'm4a',
    ['audio/x-m4a'] = 'm4a', ['audio/mpeg'] = 'mp3', ['audio/mp3'] = 'mp3',
    ['audio/aac'] = 'aac', ['audio/wav'] = 'wav', ['audio/wave'] = 'wav',
    ['audio/x-wav'] = 'wav', ['audio/flac'] = 'flac', ['audio/x-flac'] = 'flac',
}

-- The player-facing codes are already translated by the phone. Provider details stay in the log.
local CODE_BY_ERROR <const> = {
    UNAUTHORIZED = 'no-key',
    FORBIDDEN = 'no-key',
    INVALID_PATH = 'bad-data',
    FILE_TOO_LARGE = 'bad-data',
    CONTENT_TYPE_NOT_ALLOWED = 'bad-data',
}

---Config key first, then the server convar; read fresh for each upload.
---@return string
function fivemesh.key()
    local key = (config.ApiKeys or {}).FiveMeshCdn
    if type(key) == 'string' and key ~= '' then return key end
    return GetConvar(CONVAR_KEY, '')
end

---@return boolean
function fivemesh.configured()
    return fivemesh.key() ~= ''
end

---A configured folder is kept separate from Fivemanage's MediaPath. Fail on an invalid folder
---rather than silently storing a file outside the operator's intended prefix.
---@return string|nil
function fivemesh.path()
    local path = (config.Photos or {}).FiveMeshPath
    if path == nil then path = 'phone' end
    if type(path) ~= 'string' then return nil end
    path = path:gsub('^/+', ''):gsub('/+$', '')
    if path ~= '' and (('/' .. path):gsub('/[%w%-_]+', '')) ~= '' then return nil end
    return path
end

---FiveMesh stores the filename we send. Add a random suffix so simultaneous captures, exports
---and different servers sharing a folder never intentionally reuse the same object name.
---@param filename string|nil
---@param ext string
---@return string
local function uniqueFilename(filename, ext)
    local stem = type(filename) == 'string' and filename:match('([^/\\]+)$') or 'sdphone'
    stem = (stem or 'sdphone'):gsub('%.[^%.]*$', ''):gsub('[^%w%-_]', '-'):sub(1, 64)
    if stem == '' then stem = 'sdphone' end
    local suffix = ('%08x%08x%08x%08x'):format(
        math.random(0, 0xFFFFFFFF), math.random(0, 0xFFFFFFFF),
        math.random(0, 0xFFFFFFFF), math.random(0, 0xFFFFFFFF))
    return ('%s-%s.%s'):format(stem, suffix, ext)
end

---Uploads a data URL using FiveMesh's server-side JSON endpoint. Media sniffing, per-player
---budgets and URL ledger recording belong to the shared uploader and its callers.
---@param dataUrl string
---@param filename string|nil
---@param cb fun(url: string|nil, err: string|nil, code: 'no-key'|'bad-data'|'provider'|nil)
function fivemesh.uploadMedia(dataUrl, filename, cb)
    local key = fivemesh.key()
    if key == '' then
        cb(nil, 'No FiveMesh CDN key configured on this server', 'no-key')
        return
    end

    local mime = type(dataUrl) == 'string' and dataUrl:match('^data:([^;,]+)') or nil
    mime = mime and mime:lower() or nil
    local ext = mime and EXT_BY_MIME[mime] or nil
    if not ext or not dataUrl:find(';base64,', 1, true) then
        cb(nil, 'Empty or unsupported media payload', 'bad-data')
        return
    end

    local path = fivemesh.path()
    if not path then
        print('^1[sd-phone:photos]^0 [UPLOAD] invalid FiveMeshPath: use folder segments containing only letters, numbers, hyphens or underscores.')
        cb(nil, 'The FiveMesh CDN upload folder is invalid', 'provider')
        return
    end

    local body = json.encode({
        data = dataUrl,
        filename = uniqueFilename(filename, ext),
        contentType = mime,
        path = path,
    })

    local settled = false
    local function settle(url, err, code)
        if settled then return end
        settled = true
        cb(url, err, code)
    end

    SetTimeout(TIMEOUT_MS, function()
        if settled then return end
        print('^1[sd-phone:photos]^0 [UPLOAD] FiveMesh CDN did not answer in time.')
        settle(nil, 'The FiveMesh CDN did not answer in time', 'provider')
    end)

    PerformHttpRequest(UPLOAD_URL, function(status, responseBody)
        if settled then return end
        local okJson, decoded = pcall(json.decode, responseBody or '')
        decoded = okJson and type(decoded) == 'table' and decoded or nil
        if status < 200 or status >= 300 or not decoded or decoded.success ~= true then
            local errorCode = decoded and type(decoded.error) == 'table' and decoded.error.code or nil
            local code = CODE_BY_ERROR[errorCode] or (status == 401 or status == 403) and 'no-key'
                or status == 413 and 'bad-data' or 'provider'
            -- Avoid logging the full response: it may contain credentials or echoed media data.
            print(('^1[sd-phone:photos]^0 [UPLOAD] FiveMesh CDN rejected the upload: HTTP %s (%s)')
                :format(tostring(status), tostring(errorCode or 'invalid response')))
            settle(nil, ('FiveMesh CDN upload failed: HTTP %s'):format(tostring(status)), code)
            return
        end

        local url = type(decoded.object) == 'table' and decoded.object.publicUrl or nil
        if type(url) ~= 'string' or #url > MAX_URL_BYTES
            or not url:match('^https://[%w%.%-]+/.+') or url:find('[%s%c]') then
            print('^1[sd-phone:photos]^0 [UPLOAD] FiveMesh CDN returned no usable public URL.')
            settle(nil, 'FiveMesh CDN returned no usable public URL', 'provider')
            return
        end
        settle(url, nil)
    end, 'POST', body, {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. key,
    })
end

return fivemesh
