---@type table Player bridge (bridge.server.player): identity + display name from a trusted source.
local player = require 'bridge.server.player'
---@type table Shared server helpers (server.util): finite-number guard for client-supplied wagers.
local util   = require 'server.util'
---@type table sd-phone config root (configs/config.lua): which games the casino offers.
local config = require 'configs.config'

---@type table Casino helpers; the table returned at end of file. Shared by the house games
---(slots, roulette) so the identity lookup, the wager sanitiser and the stats verdict are written
---once: every one of them sits in front of a chip debit, so they must not drift per game.
local shared = {}

---@type table Per-game switches (config.Casino.Games). A game missing from the table counts as on,
---so a config written before the switches existed keeps every game.
local GAMES = ((config.Casino or {}).Games) or {}

---Whether a casino game is switched on for this server.
---@param game 'blackjack'|'holdem'|'crash'|'baccarat'|'roulette'|'slots'
---@return boolean
function shared.enabled(game)
    return GAMES[game] ~= false
end

---The refusal a switched-off game answers with, so a tampered page gets a straight answer rather
---than a callback that never returns.
---@return table envelope
function shared.shut()
    return util.fail('games.gameClosedServer', 'That game is closed on this server')
end

---@param src integer player server id
---@return string|nil citizenid for a server-trusted src (nil when offline)
function shared.cidOf(src) return player.getIdentifier(src) end

---@param src integer player server id
---@return string display name for the stats board (server-resolved, capped to the column width)
function shared.nameOf(src) return (player.getName(src) or ('Player ' .. tostring(src))):sub(1, 64) end

---Coerces a client-supplied wager to a whole chip amount inside the table limits. Below the
---minimum is a rejection rather than a bump: silently raising a stake spends chips the player
---never agreed to. Above the maximum clamps, which only ever costs the house.
---@param v any client-supplied amount
---@param min integer smallest accepted wager
---@param max integer table limit
---@return integer|nil wager nil when the value is not a usable number or falls under min
function shared.wager(v, min, max)
    local n = tonumber(v)
    if not util.finite(n) then return nil end
    n = math.floor(n)
    if n < min then return nil end
    if n > max then return max end
    return n
end

---@param net integer signed chip swing for a settled round
---@return string result 'win' | 'loss' | 'draw' for stats.record
function shared.resultFor(net)
    if net > 0 then return 'win' end
    if net < 0 then return 'loss' end
    return 'draw'
end

return shared
