---@type table Pure Wi-Fi maths; no natives, no state, so both sides and the test harness can load
---it unchanged.
local wifi = {}

---Signal strength for one network at a point, 0 (out of range) to 1 (on top of the router).
---Distance is a true sphere here, height included: a router is a box in a room, not a mast on a
---hill, so a floor above should be able to fall outside a network the floor below is on.
---@param x number
---@param y number
---@param z number
---@param net table { coords: vector3, range: number }
---@return number strength 0..1
function wifi.strength(x, y, z, net)
    if type(net) ~= 'table' then return 0.0 end
    local pos   = net.coords
    local range = tonumber(net.range)
    if type(pos) ~= 'table' and type(pos) ~= 'vector3' then return 0.0 end

    local px, py, pz = tonumber(pos.x), tonumber(pos.y), tonumber(pos.z)
    if not px or not py or not pz or not range or range <= 0 then return 0.0 end

    local dx, dy, dz = x - px, y - py, z - pz
    local pct = 1.0 - (math.sqrt(dx * dx + dy * dy + dz * dz) / range)
    if pct < 0.0 then return 0.0 end
    return pct
end

---Whether a network requires a password.
---@param net table
---@return boolean
function wifi.secured(net)
    local pw = type(net) == 'table' and net.password or nil
    return type(pw) == 'string' and pw ~= ''
end

---The network carrying an id, or nil.
---@param id string|nil
---@param networks table[]|nil
---@return table|nil
function wifi.find(id, networks)
    if type(id) ~= 'string' or id == '' or type(networks) ~= 'table' then return nil end
    for i = 1, #networks do
        local net = networks[i]
        if type(net) == 'table' and net.id == id then return net end
    end
    return nil
end

---Every network in reach of a point, strongest first, shaped for the UI. Networks with no id are
---skipped: an id is what everything else refers to, so one without it can never be connected to.
---@param x number
---@param y number
---@param z number
---@param networks table[]|nil
---@param floor number|nil strength below which a network is treated as out of reach (default 0)
---@return table[] found { id, ssid, secured, strength }
function wifi.scan(x, y, z, networks, floor)
    local out = {}
    if type(networks) ~= 'table' then return out end
    local min = tonumber(floor) or 0.0

    for i = 1, #networks do
        local net = networks[i]
        if type(net) == 'table' and type(net.id) == 'string' and net.id ~= '' then
            local strength = wifi.strength(x, y, z, net)
            if strength > min then
                out[#out + 1] = {
                    id       = net.id,
                    ssid     = tostring(net.ssid or net.id),
                    secured  = wifi.secured(net),
                    strength = strength,
                }
            end
        end
    end

    table.sort(out, function(a, b)
        if a.strength == b.strength then return a.id < b.id end
        return a.strength > b.strength
    end)
    return out
end

---Bars for a Wi-Fi strength, 0 to 3, matching the three-arc glyph phones draw.
---@param strength number 0..1
---@return integer bars 0..3
function wifi.bars(strength)
    local s = tonumber(strength) or 0.0
    if s <= 0.0 then return 0 end
    if s < 0.35 then return 1 end
    if s < 0.70 then return 2 end
    return 3
end

---Whether a password satisfies a network. An open network accepts anything, including nothing.
---@param net table|nil
---@param password string|nil
---@return boolean
function wifi.accepts(net, password)
    if type(net) ~= 'table' then return false end
    if not wifi.secured(net) then return true end
    return type(password) == 'string' and password == net.password
end

return wifi
