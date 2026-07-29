---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Pure Wi-Fi maths (shared.wifi): strength, bars, scan and password checks.
local wifi = require 'shared.wifi'

---@type table Wi-Fi settings (configs/wifi.lua): networks, capabilities, scan cadence.
local cfg = config.Wifi or {}
---@type table[] Routers this phone can see, empty while the system is switched off. Folding Enabled
---in here means every reading downstream treats a disabled system as a world with no routers.
local NETWORKS = {}
do
    local list = (cfg.Enabled == true and type(cfg.Networks) == 'table') and cfg.Networks or {}
    for i = 1, #list do
        local net = list[i]
        -- An id is what the exports, the gating and a player's remembered networks all refer to,
        -- so an entry without one could never be joined and is dropped here rather than later.
        if type(net) == 'table' and type(net.id) == 'string' and net.id ~= '' then
            NETWORKS[#NETWORKS + 1] = net
        end
    end
end
---@type table What a live connection carries, keyed as configs/wifi.lua writes it.
local PROVIDES = type(cfg.Provides) == 'table' and cfg.Provides or {}
---@type table<string, string> Capability name to the Provides key that answers for it.
local CAPABILITY = { text = 'Text', call = 'Call', data = 'Data' }
---@type boolean Whether a network joined once is rejoined on sight without asking again.
local REMEMBER = cfg.Remember == true
---@type number Strength at or below which a network is out of reach: the scan floor, and the point
---a live connection is dropped.
local DROP_BELOW = tonumber(cfg.DropBelow) or 0.05
---@type integer Milliseconds between scans while the phone is on screen.
local TICK_MS = math.max(250, math.floor((tonumber(cfg.ScanSeconds) or 2) * 1000))

---@type table Wi-Fi module; the table returned at end of file.
local wifiClient = {}

---@type boolean The radio switch the player owns, separate from whether the server configured any
---networks at all. Off means nothing is scanned, joined or carried.
local radioOn = true
---@type fun(force: boolean|nil) Forward declaration: setEnabled pushes through it before it is defined.
local refresh
---@type table|nil The joined network as configs/wifi.lua defines it, nil while off Wi-Fi.
local joined = nil
---@type number Strength of the joined network as of the last scan, 0..1.
local joinedStrength = 0.0
---@type table[] Last scan result, strongest first, each entry carrying its bar count.
local scanned = {}
---@type table<string, string|boolean> Networks this character has joined: the password that
---worked, or true for an open one. Seeded from the server on open and written through on change.
local remembered = {}
---@type boolean True once this character's stored state has been read back, so the hydrate runs
---once per character rather than once per open.
local hydrated = false
---@type boolean True while a hydrate is in flight, so a second open cannot stack another.
local hydrating = false
---@type integer Bumped on every character change. A hydrate reply carrying a stale epoch belongs
---to the character that just left and is dropped whole rather than written over the new one.
local epoch = 0
---@type boolean True while the phone is on screen; gates the scan entirely.
local phoneOpen = false
---@type boolean True while an auto-rejoin is in flight, so a scan cannot stack a second one.
local rejoining = false
---@type string Last pushed connection signature, '<id>:<bars>' or empty while off Wi-Fi.
local lastConnection = ''
---@type string Last pushed nearby signature: the ids in scan order.
local lastNearby = ''

---Whether the system is on with at least one joinable network. False means nothing is scanned and
---the phone falls back to cell service alone.
---@return boolean
function wifiClient.enabled()
    return radioOn and #NETWORKS > 0
end

---Switches the radio. Turning it off leaves whatever is joined and stops the scan answering, so
---nothing keeps carrying data behind a switch the player has set to off.
---@param on boolean
function wifiClient.setEnabled(on)
    local want = on == true
    if want == radioOn then return end
    radioOn = want

    if not radioOn then
        wifiClient.disconnect()
        scanned = {}
    end
    -- Written through rather than awaited inline: the switch has already taken locally, and the
    -- pane must not sit on a round trip to say so.
    CreateThread(function()
        lib.callback.await('sd-phone:server:wifi:setEnabled', false, { on = want })
    end)
    refresh(true)
end

---@return boolean
function wifiClient.radioEnabled()
    return radioOn
end

---The joined network as the UI shows it, or nil while off Wi-Fi.
---@return { id: string, ssid: string, strength: number, bars: integer }|nil
function wifiClient.current()
    if not joined then return nil end
    return {
        id       = joined.id,
        ssid     = tostring(joined.ssid or joined.id),
        strength = joinedStrength,
        bars     = wifi.bars(joinedStrength),
    }
end

---@return boolean
function wifiClient.connected()
    return joined ~= nil
end

---Whether a live connection carries a capability. Always false off Wi-Fi, so a caller can OR this
---against cell service without checking the connection first.
---@param capability string 'text' | 'call' | 'data'
---@return boolean
function wifiClient.provides(capability)
    if not joined then return false end
    local key = CAPABILITY[tostring(capability)]
    return key ~= nil and PROVIDES[key] == true
end

---Every network in reach as of the last scan, strongest first, as fresh tables.
---@return table[] networks { id, ssid, secured, strength, bars }
function wifiClient.nearby()
    local out = {}
    for i = 1, #scanned do
        local entry = scanned[i]
        out[i] = {
            id       = entry.id,
            ssid     = entry.ssid,
            secured  = entry.secured,
            strength = entry.strength,
            bars     = entry.bars,
            -- Already joined once by this character, so rejoining needs no password. The UI uses
            -- this to tap straight through instead of asking again for something it knows.
            known    = remembered[entry.id] ~= nil,
        }
    end
    return out
end

---The whole Wi-Fi picture the NUI renders: the joined network plus everything in reach.
---@return { enabled: boolean, connected: table|nil, networks: table[] }
local function snapshot()
    return {
        enabled   = wifiClient.enabled(),
        -- Whether this server runs Wi-Fi at all, which `enabled` cannot say on its own: a
        -- switched-off radio and a server with no networks both read as false there. The status
        -- bar needs the difference to know whether the legacy static icon still applies.
        configured = #NETWORKS > 0,
        connected = wifiClient.current(),
        networks  = wifiClient.nearby(),
        -- Whether this connection carries data, which the cell push cannot answer: its own `data`
        -- flag is computed from the masts alone. Without this the UI would grey out a download
        -- the gate would actually have allowed.
        providesData = wifiClient.provides('data'),
    }
end

---Pushes to the NUI only when the joined network, its bar count or the list of networks in reach
---actually changed, so a stationary player costs one scan a tick and no messages at all.
---@param force boolean|nil push even when nothing changed (used on open and after a join)
local function push(force)
    local ids = {}
    for i = 1, #scanned do ids[i] = scanned[i].id end
    local nearbyKey = table.concat(ids, ',')
    local connKey = joined and (joined.id .. ':' .. wifi.bars(joinedStrength)) or ''

    local changed = force or connKey ~= lastConnection or nearbyKey ~= lastNearby
    lastConnection, lastNearby = connKey, nearbyKey
    if not changed then return end

    SendNUIMessage({ action = 'sd-phone:wifi', data = snapshot() })
end

---Asks the server to join a network, then records the connection when it agrees. The password is
---never checked here: the client holds the whole config, so only the server's answer counts.
---@param id string
---@param password string|nil
---@return boolean joined, string|nil message rejection reason, nil once joined
function wifiClient.connect(id, password)
    if not wifiClient.enabled() then return false, 'Wi-Fi is unavailable' end

    local net = wifi.find(id, NETWORKS)
    if not net then return false, 'Unknown network' end

    -- Rejoining a network this character already knows reuses the password that worked, so the
    -- phone never asks twice for the same network. Forgetting it is what clears that.
    local supplied = (type(password) == 'string' and password ~= '') and password or nil
    if not supplied and type(remembered[id]) == 'string' then supplied = remembered[id] end

    local res = lib.callback.await('sd-phone:server:wifi:connect', false, { id = id, password = supplied })
    if type(res) ~= 'table' or res.success ~= true then
        return false, (type(res) == 'table' and res.message) or 'Could not connect'
    end

    joined = net
    local pos = GetEntityCoords(PlayerPedId())
    joinedStrength = wifi.strength(pos.x, pos.y, pos.z, net)
    -- The password that worked is kept beside the id so an auto-rejoin can hand it back and let
    -- the server check it again, rather than the player being asked a second time. The durable
    -- copy is written server-side off the same join, from the config's password rather than this.
    remembered[net.id] = supplied or true
    push(true)
    return true, nil
end

---Leaves the joined network and tells the server. No-op while already off Wi-Fi.
function wifiClient.disconnect()
    if not joined then return end
    TriggerServerEvent('sd-phone:server:wifi:disconnect')
    joined, joinedStrength = nil, 0.0
    push(true)
end

---Drops a network from this character's remembered list, so auto-rejoin stops picking it up. Told
---to the server too, so a forgotten network stays forgotten across a restart.
---@param id string|nil
function wifiClient.forget(id)
    if type(id) ~= 'string' then return end
    remembered[id] = nil
    TriggerServerEvent('sd-phone:server:wifi:forget', id)
    -- Forgetting the network you are on leaves it too, which is what the button says on a real
    -- phone. Staying joined to something the phone has been told to forget reads as a bug.
    if joined and joined.id == id then wifiClient.disconnect() end
end

---Rescans from the player's position, drops a connection that has faded out, and rejoins a
---remembered network in reach when nothing is connected.
---@param force boolean|nil push even when nothing changed (used on open)
function refresh(force)
    -- A switched-off radio scans nothing and holds nothing, so the page shows an empty list
    -- rather than networks it would refuse to join.
    if not radioOn then
        scanned = {}
        push(force)
        return
    end

    local pos = GetEntityCoords(PlayerPedId())
    scanned = wifi.scan(pos.x, pos.y, pos.z, NETWORKS, DROP_BELOW)
    for i = 1, #scanned do
        scanned[i].bars = wifi.bars(scanned[i].strength)
    end

    if joined then
        local strength = wifi.strength(pos.x, pos.y, pos.z, joined)
        if strength <= DROP_BELOW then
            wifiClient.disconnect()
        else
            joinedStrength = strength
        end
    end

    -- Walking back into a network joined earlier rejoins it silently. The server re-checks the
    -- password it is handed, so a remembered id on its own opens nothing.
    if REMEMBER and not joined and not rejoining then
        for i = 1, #scanned do
            local saved = remembered[scanned[i].id]
            if saved ~= nil then
                local id = scanned[i].id
                rejoining = true
                CreateThread(function()
                    wifiClient.connect(id, type(saved) == 'string' and saved or nil)
                    rejoining = false
                end)
                break
            end
        end
    end

    push(force)
end

---Reads this character's stored radio switch and remembered networks back from the server, once.
---Threaded like the auto-rejoin above, so the scan tick is never held behind the round trip.
local function hydrate()
    if hydrated or hydrating or #NETWORKS == 0 then return end
    hydrating = true
    local mine = epoch

    CreateThread(function()
        local res = lib.callback.await('sd-phone:server:wifi:state', false)
        if mine ~= epoch then return end
        hydrating = false
        -- A refusal means the character is not resolvable yet (mid-spawn, multichar pick), so the
        -- flag stays down and the next open tries again rather than locking in stock state.
        if type(res) ~= 'table' or res.success ~= true or type(res.data) ~= 'table' then return end

        hydrated = true
        radioOn = res.data.enabled ~= false
        remembered = {}
        local known = type(res.data.known) == 'table' and res.data.known or {}
        for id, saved in pairs(known) do
            if type(id) == 'string' then
                remembered[id] = type(saved) == 'string' and saved or true
            end
        end

        -- A stored-off radio has to drop anything the scan got in first with, or the phone keeps
        -- carrying data behind a switch it has just read as off.
        if not radioOn then
            wifiClient.disconnect()
            scanned = {}
        end
        refresh(true)
    end)
end

---Drops everything the outgoing character owned and re-reads from the server. A live switch
---reuses this client, so the joined network, the radio switch and the remembered list all go
---before the incoming character's state can land on top of them.
local function resetForCharacter()
    epoch = epoch + 1
    wifiClient.disconnect()
    hydrated, hydrating, remembered, radioOn, scanned = false, false, {}, true, {}
    hydrate()
end

---Returns the current Wi-Fi picture for the Settings pane on mount.
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:wifi:list', function(_, cb)
    cb({ success = true, data = snapshot() })
end)

---Joins a network, answering with the server's own verdict so the pane can show why it refused.
---@param payload table|nil { id: string, password: string|nil }
---@param cb fun(result: table) NUI response envelope
RegisterNUICallback('sd-phone:wifi:connect', function(payload, cb)
    local data = type(payload) == 'table' and payload or {}
    local ok, message = wifiClient.connect(data.id, data.password)
    cb({ success = ok, message = message })
end)

---Leaves the joined network.
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:wifi:disconnect', function(_, cb)
    wifiClient.disconnect()
    cb({ success = true })
end)

---Forgets a network, so it is no longer rejoined on sight.
---@param payload table|nil { id: string }
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:wifi:forget', function(payload, cb)
    wifiClient.forget(type(payload) == 'table' and payload.id or nil)
    cb({ success = true })
end)

---The Wi-Fi switch in Settings. Answers with the state that actually took, so a server with no
---networks configured cannot be switched on into a radio that would find nothing.
RegisterNUICallback('sd-phone:wifi:setEnabled', function(payload, cb)
    wifiClient.setEnabled(type(payload) == 'table' and payload.on == true)
    cb({ success = true, data = { enabled = wifiClient.enabled() } })
end)

-- Only scans while the phone is on screen: a holstered phone costs nothing at all. The stored
-- state is pulled on the first open, which is the earliest point a citizenid is sure to exist.
AddEventHandler('sd-phone:client:openState', function(open)
    phoneOpen = open == true
    if not phoneOpen then return end
    hydrate()
    if wifiClient.enabled() then refresh(true) end
end)

-- The same signals client/main.lua rebuilds its character state on. characterLoaded only ever
-- travels to the NUI, so the framework events it is pushed from are what this side listens to.
RegisterNetEvent('QBCore:Client:OnPlayerLoaded', resetForCharacter)
RegisterNetEvent('esx:playerLoaded', resetForCharacter)
RegisterNetEvent('sd-phone:client:rehydrate', resetForCharacter)

CreateThread(function()
    if not wifiClient.enabled() then return end
    while true do
        Wait(TICK_MS)
        if phoneOpen then refresh(false) end
    end
end)

return wifiClient
