---@type table Online-game engine (server.games.engine): lobbies, invites, move relay, wagers, stats.
local engine = require 'server.games.engine'

-- Wordle online: the generalized engine with two cosmetic sides ('a'/'b') racing the same word;
-- freeRelay lets each client push its own progress snapshots without turn enforcement.
engine.register('wordle', { sides = { 'a', 'b' }, title = 'Wordle', currency = 'bank', freeRelay = true })
