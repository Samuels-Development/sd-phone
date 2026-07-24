---@type table<string, table> Live registries by app id; `of` memoises so every module asking for
---the same name shares one set.
local registries = {}

---@type table Watcher-registry factory; the table returned at end of file.
local M = {}

---Builds an independent registry: the set of players with one app open, so a push reaches only
---the phones that will do something with it instead of every player on the server.
---@return table registry
local function newRegistry()
    ---@type table<number, boolean> Subscribed sources.
    local watchers = {}
    local r = {}

    ---Subscribes or unsubscribes a player.
    ---@param src number player server id
    ---@param on boolean true to subscribe
    function r.watch(src, on) watchers[src] = on and true or nil end

    ---Drops a player's subscription (disconnect, or a stale entry found while pushing).
    ---@param src number|nil player server id
    function r.drop(src) if src then watchers[src] = nil end end

    ---@return boolean any true when at least one player has the app open
    function r.any() return next(watchers) ~= nil end

    ---Pushes an event to every live watcher, clearing entries whose player has gone. `exceptSrc`
    ---skips one player (the actor, who already applied the change locally) without leaving their
    ---entry unpruned.
    ---@param event string client event name
    ---@param payload table event payload
    ---@param exceptSrc number|nil source to skip
    function r.push(event, payload, exceptSrc)
        for src in pairs(watchers) do
            if not GetPlayerName(src) then
                watchers[src] = nil
            elseif src ~= exceptSrc then
                TriggerClientEvent(event, src, payload)
            end
        end
    end

    return r
end

---The registry for `name`, created on first use. Every module requiring the same name gets the
---same set, so a subscribe on one side is visible to the broadcast on the other.
---@param name string app id ('stocks', 'pages', 'marketplace', ...)
---@return table registry
function M.of(name)
    local r = registries[name]
    if not r then
        r = newRegistry()
        registries[name] = r
    end
    return r
end

return M
