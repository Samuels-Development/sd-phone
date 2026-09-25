---@type table Media sniffer; the table returned at end of file. Reads the first bytes of a base64
---data URL and says whether they really are the kind of media the URL's type claims.
---
---The label on a data URL is whatever the client wrote. Without this, any bytes could be uploaded
---under `data:video/`, which is how a still image rode the 24 MB clip route instead of the 4 MB
---photo route, and how the owner's bucket could be used to host files that are not media at all.
local sniff = {}

---@type table<string, integer> Six-bit value of each base64 character, standard and url-safe.
local B64 = {}
do
    local alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    for i = 1, #alphabet do B64[alphabet:sub(i, i)] = i - 1 end
    B64['-'], B64['_'] = 62, 63
end

---@type integer Bytes read from the head of the payload; enough for every signature below.
local HEAD_BYTES <const> = 12

---Decodes the first HEAD_BYTES of a base64 payload.
---@param payload string
---@return integer[]|nil bytes
local function head(payload)
    local out, acc, bits = {}, 0, 0
    for i = 1, #payload do
        local v = B64[payload:sub(i, i)]
        if not v then break end
        acc = ((acc << 6) | v) & 0xFFFFFF
        bits = bits + 6
        if bits >= 8 then
            bits = bits - 8
            out[#out + 1] = (acc >> bits) & 0xFF
            if #out >= HEAD_BYTES then return out end
        end
    end
    return #out >= HEAD_BYTES and out or nil
end

---@param b integer[]
---@param at integer 1-based offset
---@param text string
---@return boolean
local function ascii(b, at, text)
    for i = 1, #text do
        if b[at + i - 1] ~= text:byte(i) then return false end
    end
    return true
end

---What the bytes are: a still image, a container that can hold video or audio, or plain audio.
---@param b integer[]
---@return 'image'|'container'|'audio'|nil
local function family(b)
    if b[1] == 0xFF and b[2] == 0xD8 and b[3] == 0xFF then return 'image' end            -- JPEG
    if b[1] == 0x89 and ascii(b, 2, 'PNG') then return 'image' end                       -- PNG
    if ascii(b, 1, 'GIF8') then return 'image' end                                       -- GIF
    if ascii(b, 1, 'RIFF') and ascii(b, 9, 'WEBP') then return 'image' end               -- WebP

    if b[1] == 0x1A and b[2] == 0x45 and b[3] == 0xDF and b[4] == 0xA3 then return 'container' end -- WebM / Matroska
    if ascii(b, 5, 'ftyp') then return 'container' end                                   -- MP4 / MOV / M4A
    if ascii(b, 1, 'OggS') then return 'container' end                                   -- Ogg

    if ascii(b, 1, 'ID3') then return 'audio' end                                        -- MP3 with tags
    if b[1] == 0xFF and (b[2] & 0xE0) == 0xE0 then return 'audio' end                    -- MPEG / ADTS frame
    if ascii(b, 1, 'RIFF') and ascii(b, 9, 'WAVE') then return 'audio' end               -- WAV
    if ascii(b, 1, 'fLaC') then return 'audio' end                                       -- FLAC
    return nil
end

---@type table<string, true> Media types a data URL may declare.
local ALLOWED <const> = {
    ['image/jpeg'] = true, ['image/jpg'] = true, ['image/png'] = true, ['image/gif'] = true,
    ['image/webp'] = true,
    ['video/webm'] = true, ['video/mp4'] = true, ['video/quicktime'] = true, ['video/ogg'] = true,
    ['video/x-matroska'] = true,
    ['audio/webm'] = true, ['audio/ogg'] = true, ['audio/mp4'] = true, ['audio/x-m4a'] = true,
    ['audio/mpeg'] = true, ['audio/mp3'] = true, ['audio/aac'] = true, ['audio/wav'] = true,
    ['audio/wave'] = true, ['audio/x-wav'] = true, ['audio/flac'] = true, ['audio/x-flac'] = true,
}

---Whether a base64 data URL's bytes are the kind of media its type names. A still must be an
---image, a clip must be a video container, and audio may be plain audio or a container, because
---MediaRecorder writes a voice note into WebM or Ogg.
---@param dataUrl any
---@return boolean ok
---@return string|nil declared the type family the URL claims ('image'|'video'|'audio')
function sniff.matches(dataUrl)
    if type(dataUrl) ~= 'string' then return false end
    local mime = dataUrl:match('^data:([^;,]+)')
    mime = mime and mime:lower() or nil
    local declared = mime and mime:match('^(%a+)/') or nil
    local comma = dataUrl:find(',', 1, true)
    if not declared or not comma or not dataUrl:sub(1, comma):find(';base64,', 1, true) then
        return false, declared
    end
    if not ALLOWED[mime] then return false, declared end

    local bytes = head(dataUrl:sub(comma + 1, comma + 32))
    local kind = bytes and family(bytes) or nil
    if declared == 'image' then return kind == 'image', declared end
    if declared == 'video' then return kind == 'container', declared end
    if declared == 'audio' then return kind == 'audio' or kind == 'container', declared end
    return false, declared
end

return sniff
