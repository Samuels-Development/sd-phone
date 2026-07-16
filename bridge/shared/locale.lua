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

---Localised lookup; returns `key` when no translation exists. Replacement values are %-escaped
---before substitution.
---@param key string
---@param replacements? table<string, any>
---@return string
function locale.t(key, replacements)
    local lstr = dict[key]
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

return locale
