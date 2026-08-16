---@type string Fallback owner, used only when the caller names nobody. This file executes inside
---vRP's Lua state, where GetCurrentResourceName() answers 'vrp' rather than the phone, so the owning
---resource cannot be discovered here and has to arrive from the caller.
local DEFAULT_OWNER = 'sd-phone'

---@type string Adapter chunk path, relative to the owning resource.
local EXT_PATH = 'vrp/ext.lua'

---@type integer Wire version of this injection contract. inject.lua refuses to bind unless it sees
---this exact value, which is what makes the handshake self-verifying on a renamed vRP 2 fork.
local PROTOCOL = 2

---Load and run sd-phone's vRP adapter inside vRP's Lua state.
---
---vRP's own module() memoises by path, so the file you are reading executes exactly once per vrp
---lifetime and can never be hot-updated. That is why it carries no behaviour: everything real lives
---in vrp/ext.lua, which this export re-reads from disk on every sd-phone start. Updating sd-phone on
---a live vRP 2 server therefore needs no vrp restart.
---
---The owner is a PARAMETER rather than a constant, and that matters more here than anywhere else in
---the feature: this chunk is frozen for vRP's lifetime, so a wrong resource name baked in at this
---line could not be corrected without restarting vrp itself. The caller knows its own name, so it
---passes it. A folder renamed on the way out of a GitHub zip is the ordinary case, not an exotic one.
---
---Every failure path reports and returns false rather than raising, because this runs inside vRP's
---own state where an uncaught error would surface as a vRP fault.
---@param owner? string Resource holding vrp/ext.lua. Defaults to 'sd-phone'.
---@return boolean loaded True only when the adapter parsed and ran to completion.
exports('sdp_boot', function(owner)
    local rsc = (type(owner) == 'string' and owner ~= '') and owner or DEFAULT_OWNER

    local code = LoadResourceFile(rsc, EXT_PATH)
    if not code then
        print('[sd-phone] ' .. EXT_PATH .. ' not found in resource ' .. rsc)
        return false
    end

    -- The leading '@' makes Lua treat the chunk name as a file path, so a runtime error inside the
    -- adapter reports a usable location instead of dumping the whole source text.
    local f, err = load(code, '@' .. rsc .. '/' .. EXT_PATH)
    if not f then
        print('[sd-phone] ext.lua parse error: ' .. tostring(err))
        return false
    end

    local ok, res = xpcall(f, debug.traceback)
    if not ok then
        print('[sd-phone] ext.lua error: ' .. tostring(res))
        return false
    end

    return true
end)

---Handshake probe, answerable before the adapter has ever been booted.
---
---It reports two separate things on purpose: `protocol` proves this injection reached a vRP 2 state
---at all, while `caps` reports which vRP modules are actually enabled. A trimmed vRP install with
---the money or inventory module switched off still handshakes; the phone just short-circuits those
---feature areas without paying a round trip to discover it.
---@return { protocol: integer, caps: table<string, boolean> }
exports('sdp_ping', function()
    return { protocol = PROTOCOL, caps = (_G.SDPHONE_CAPS or {}) }
end)
