---@type table sd-phone config root (configs/config.lua) - config.ApiKeys holds the media token.
local config = require 'configs.config'

---@type table Qbox CDN provider (server.photos.qbox): the multipart route through the Node helper.
local qbox = require 'server.photos.qbox'

---@type table FiveMesh CDN provider (server.photos.fivemesh): the server-side base64 JSON route.
local fivemesh = require 'server.photos.fivemesh'

---@type table Media URL ledger (server.media.ledger): records every URL this server hosts, so a
---presigned-upload claim can tell a fresh object from one that already belongs to another app.
local ledger = require 'server.media.ledger'

---@type table Media sniffer (server.media.sniff): the bytes must be the media their label claims.
local sniff = require 'server.media.sniff'

---@type table Uploader module; the table returned at end of file.
local uploader = {}

---@type table Photos config (configs/photos.lua): which CDN the uploads go to.
local PHOTOS = type(config.Photos) == 'table' and config.Photos or {}

-- Response shape: { data = { id, url }, status = "ok" }.
---@type string Fivemanage media upload endpoint (v3 base64 route).
local UPLOAD_URL = 'https://api.fivemanage.com/api/v3/file/base64'

-- Media key: configs/server/apikeys.lua (FivemanageMedia), else the legacy convar below.
---@type string Legacy convar name still honoured when the config key is blank.
local CONVAR_KEY = 'sd_fivemanage_key'

---Returns the Fivemanage Media token: configs/server/apikeys.lua first, else the legacy
---convar; read fresh on every upload.
---@return string key the media token, or '' when unconfigured
local function mediaKey()
    local k = (config.ApiKeys or {}).FivemanageMedia
    if type(k) == 'string' and k ~= '' then return k end
    return GetConvar(CONVAR_KEY, '')
end

---The Fivemanage Media token, for the one caller that needs to authenticate a request this module
---does not make itself: server.photos.presign mints upload slots against the same account. Kept
---server-side like every other read of it, and never handed to a client.
---@return string key the media token, or '' when unconfigured
function uploader.mediaKey()
    return mediaKey()
end

---Which CDN this server uploads to. Unknown values stay on Fivemanage, so a typo
---never silently sends media somewhere the owner did not choose.
---@return 'fivemanage'|'qbox'|'fivemesh'
function uploader.provider()
    local provider = tostring(PHOTOS.Provider or 'fivemanage'):lower()
    if provider == 'qbox' or provider == 'fivemesh' then return provider end
    return 'fivemanage'
end

---True when the active provider has a token set. Read at boot so a server missing its key is
---told once at startup, instead of every player discovering it as a capture that never lands.
---@return boolean
function uploader.configured()
    if uploader.provider() == 'qbox' then return qbox.configured() end
    if uploader.provider() == 'fivemesh' then return fivemesh.configured() end
    return mediaKey() ~= ''
end

---Uploads a base64 data-URL to Fivemanage and hands back the hosted CDN URL. Asynchronous:
---calls `cb(url|nil, err, code)` exactly once. `err` is the human sentence the recording and
---bodycam UIs already surface; `code` is a stable token the phone maps to a translated line, so
---a caller can localise the reason without matching on English prose.
---@param base64Image string media as a base64 data-URL (data:image/...;base64,...)
---@param filename string suggested filename stored alongside the upload
---@param cb fun(url: string|nil, err: string|nil, code: 'no-key'|'bad-data'|'provider'|nil)
local function uploadFivemanage(base64Image, filename, cb)
    local key = mediaKey()

    if key == '' then
        print('^1[sd-phone:photos]^0 [UPLOAD] aborting: no Fivemanage media key. Set FivemanageMedia in configs/server/apikeys.lua, or the sd_fivemanage_key convar.')
        cb(nil, 'No Fivemanage media key configured on this server', 'no-key')
        return
    end

    if type(base64Image) ~= 'string' or base64Image == '' then
        print('^1[sd-phone:photos]^0 [UPLOAD] aborting: empty media payload')
        cb(nil, 'Empty media payload', 'bad-data')
        return
    end


    local body = json.encode({
        base64   = base64Image,
        filename = filename or ('sdphone-%d.jpg'):format(os.time()),
    })


    PerformHttpRequest(UPLOAD_URL, function(status, responseBody, _headers)

        -- Each branch reports the same 'provider' code to the player, who can act on none of
        -- them, while the console line names the one that actually happened.
        if status ~= 200 and status ~= 201 then
            print(('^1[sd-phone:photos]^0 [UPLOAD] Fivemanage rejected the upload: HTTP %s %s')
                :format(tostring(status), tostring(responseBody)))
            cb(nil, ('Fivemanage upload failed: HTTP %s'):format(tostring(status)), 'provider')
            return
        end

        if not responseBody or responseBody == '' then
            print('^1[sd-phone:photos]^0 [UPLOAD] Fivemanage returned an empty response body')
            cb(nil, 'Empty response from Fivemanage', 'provider')
            return
        end

        local okJson, decoded = pcall(json.decode, responseBody)
        if not okJson or type(decoded) ~= 'table' then
            print(('^1[sd-phone:photos]^0 [UPLOAD] unparseable Fivemanage response: %s')
                :format(tostring(responseBody)))
            cb(nil, 'Could not parse the Fivemanage response', 'provider')
            return
        end

        local url = type(decoded.data) == 'table' and decoded.data.url or nil
        if type(url) ~= 'string' or url == '' then
            print(('^1[sd-phone:photos]^0 [UPLOAD] Fivemanage returned no URL: %s'):format(tostring(responseBody)))
            cb(nil, 'Fivemanage returned no URL', 'provider')
            return
        end

        cb(url, nil)
    end, 'POST', body, {
        ['Content-Type']  = 'application/json',
        ['Authorization'] = key,
    })
end

---Uploads a base64 data-URL to whichever CDN this server is set to and hands back the hosted URL.
---Asynchronous: calls `cb(url|nil, err, code)` exactly once.
---@param base64Image string media as a base64 data-URL (data:image/...;base64,...)
---@param filename string suggested filename stored alongside the upload
---@param cb fun(url: string|nil, err: string|nil, code: 'no-key'|'bad-data'|'provider'|nil)
function uploader.uploadMedia(base64Image, filename, cb)
    -- Every server-side upload in the resource funnels through here, whichever app asked for it,
    -- so this is the one place that can tell the ledger about a hosted object without each caller
    -- having to remember. A direct-upload claim is refused for anything the ledger already knows,
    -- and a URL that never got recorded is a URL somebody else can claim as their own.
    local function recorded(url, err, code)
        if url then ledger.record(url) end
        cb(url, err, code)
    end

    -- Every caller caps size by the label (a still at 4 MB, a clip at 32 MB), so the label has to
    -- be true: otherwise an image sent as data:video/ gets the clip allowance, and anything at all
    -- can be hosted on the owner's account as long as it is called media.
    local okMedia, declared = sniff.matches(base64Image)
    if not okMedia then
        print(('^1[sd-phone:photos]^0 [UPLOAD] refused: the payload is not the %s its data URL claims')
            :format(tostring(declared or 'media')))
        cb(nil, 'The file is not a supported photo, video or audio format', 'bad-data')
        return
    end

    if uploader.provider() == 'qbox' then
        qbox.uploadMedia(base64Image, filename, recorded)
        return
    end
    if uploader.provider() == 'fivemesh' then
        fivemesh.uploadMedia(base64Image, filename, recorded)
        return
    end
    uploadFivemanage(base64Image, filename, recorded)
end

return uploader
