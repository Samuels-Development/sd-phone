---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table Voice config (configs/voice.lua): backend pin plus the detection order.
local V = type(config.Voice) == 'table' and config.Voice or {}

---@type { name: string, provider: string }[] Detection order used when the config omits one, so a
---server whose configs predate this file still resolves a backend.
local DEFAULT_RESOURCES <const> = {
    { name = 'ai-voice',  provider = 'pma-voice' },
    { name = 'pma-voice', provider = 'pma-voice' },
    { name = 'saltychat', provider = 'saltychat' },
}

---Resolves which voice resource is running and which API dialect it speaks.
---
---The two are tracked separately on purpose: the RESOURCE is what exports are called on, the
---PROVIDER is which calls are legal. A renamed SaltyChat fork has its own resource name and still
---speaks 'saltychat', and sniffing exports to tell them apart is not possible - both scripts
---register only their own names, and a missing export raises rather than returning nil.
---
---A pin wins outright, including over a resource that is not reporting as started: an operator
---who names a dialect has told us more than GetResourceState can.
---@return string|nil resource, string|nil provider
local function detect()
    local list = type(V.Resources) == 'table' and #V.Resources > 0 and V.Resources or DEFAULT_RESOURCES

    local pin = V.Provider
    if pin and pin ~= 'auto' then
        for _, entry in ipairs(list) do
            if entry.provider == pin and GetResourceState(entry.name) == 'started' then
                return entry.name, pin
            end
        end
        for _, entry in ipairs(list) do
            if entry.provider == pin then return entry.name, pin end
        end
        return pin, pin
    end

    for _, entry in ipairs(list) do
        if GetResourceState(entry.name) == 'started' then return entry.name, entry.provider end
    end
    return nil, nil
end

local RESOURCE, PROVIDER = detect()

---@type table Module table; the table returned at end of file. Resolved once at require time,
---because a server does not swap voice scripts while running.
return {
    ---@type string|nil Resource name exports are invoked on, nil when no supported script runs.
    resource = RESOURCE,
    ---@type string|nil API dialect: 'pma-voice' or 'saltychat', nil when none was found.
    provider = PROVIDER,
}
