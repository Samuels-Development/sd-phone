---@type table Locale module: loads locales/<lang>.json, flattens it to dot-path keys, and exposes
---a t(key, replacements) lookup.
local locale = {}

---@type table|nil sd-phone config root (configs.config), nil when this context doesn't ship it.
local config = (function()
    local ok, c = pcall(require, 'configs.config')
    return ok and c or nil
end)()

---@type table<string, any> Flattened dot-path -> translation dictionary for the loaded language.
local dict = {}

---Recursively flattens a nested JSON-decoded table into dot-notation keys written into `target`
---(e.g. `{ menu = { buy = 'Buy' } }` becomes `target['menu.buy'] = 'Buy'`).
---@param prefix string|nil
---@param source table
---@param target table<string, any>
local function flatten(prefix, source, target)
    for key, value in pairs(source) do
        local newKey = prefix and (prefix .. '.' .. key) or key
        if type(value) == 'table' then
            flatten(newKey, value, target)
        else
            target[newKey] = value
        end
    end
end

---Localised lookup; falls back to `english` when the catalogue has no entry for the key, and to
---the key itself when there is no fallback either. Replacement values are %-escaped before
---substitution. Passing the replacements table as the second argument is still accepted.
---@param key string
---@param english? string|table<string, any> English text, or the replacements table
---@param replacements? table<string, any>
---@return string
function locale.t(key, english, replacements)
    if type(english) == 'table' then
        english, replacements = nil, english
    end

    local lstr = dict[key] or english
    if lstr and replacements then
        for k, v in pairs(replacements) do
            local safe = tostring(v):gsub('%%', '%%%%')
            lstr = lstr:gsub('{' .. tostring(k) .. '}', safe)
        end
    end
    return lstr or key
end

---Loads `locales/<lang>.json` into the dictionary, clearing the previous language first. Falls
---back to English when the requested file is missing; returns silently when no file exists.
---@param lang string
function locale.load(lang)
    lang = lang or 'en'
    local path = ('locales/%s.json'):format(lang)
    local file = LoadResourceFile(GetCurrentResourceName(), path)

    if not file and lang ~= 'en' then
        print('^3[SD-PHONE] Falling back to English locale^0')
        path = 'locales/en.json'
        file = LoadResourceFile(GetCurrentResourceName(), path)
    end
    if not file then return end

    local decoded = json.decode(file)
    if not decoded then
        print('^1[SD-PHONE] Failed to parse the locale JSON.^0')
        return
    end

    for k in pairs(dict) do dict[k] = nil end
    flatten(nil, decoded, dict)

    print(('^2[SD-PHONE] Loaded locale: %s^0'):format(lang))
end

-- One-shot boot thread: loads the configured language (config.Locale, default 'en') shortly after start.
CreateThread(function()
    Wait(100)
    locale.load(config and config.Locale or 'en')
end)


---@type string[] Language codes probed for a catalogue, since FiveM leaves the manifest glob
---unexpanded and offers no directory listing. Add a code here when shipping an unusual locale.
local CANDIDATES = {
    'af', 'ar', 'bg', 'bs', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fa', 'fi', 'fr',
    'he', 'hi', 'hr', 'hu', 'id', 'is', 'it', 'ja', 'ko', 'lt', 'lv', 'ms', 'nb', 'nl', 'no',
    'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'th', 'tr', 'uk', 'vi', 'zh',
}

---@type string[]|nil Probe result, held for the resource lifetime: the files cannot change
---without a restart.
local available

---The language codes this install ships a catalogue for.
---@return string[] codes ascending, always including at least 'en'
function locale.available()
    if available then return available end

    local resource = GetCurrentResourceName()
    local found = {}
    for i = 1, #CANDIDATES do
        if LoadResourceFile(resource, ('locales/%s.json'):format(CANDIDATES[i])) then
            found[#found + 1] = CANDIDATES[i]
        end
    end
    if #found == 0 then found[1] = 'en' end

    available = found
    return available
end
return locale
