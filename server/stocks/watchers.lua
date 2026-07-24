---@type table<number, boolean> Players with the Stocks app open, by src. Shared by the tick loop
---and the per-trade broadcast so neither has to push prices to the whole server.
local watchers = {}

---@type table Watcher registry; the table returned at end of file.
local M = {}

---Subscribes or unsubscribes a player to the price push.
---@param src number player server id
---@param on boolean true to subscribe
function M.watch(src, on) watchers[src] = on and true or nil end

---Drops a player's subscription (disconnect, or a stale entry found while pushing).
---@param src number player server id
function M.drop(src) watchers[src] = nil end

---@return boolean any true when at least one player has Stocks open
function M.any() return next(watchers) ~= nil end

---Pushes an event to every live watcher, clearing entries whose player has gone.
---@param event string client event name
---@param payload table event payload
function M.push(event, payload)
    for src in pairs(watchers) do
        if GetPlayerName(src) then
            TriggerClientEvent(event, src, payload)
        else
            watchers[src] = nil
        end
    end
end

return M
