---@type table Online-game engine (server.games.engine): lobbies, invites, sessions, wagers, stats.
local engine = require 'server.games.engine'

-- Wordle online: two cosmetic sides ('a'/'b') racing the same word on one clock. The rules pick the
-- word, colour every guess and decide the race.
engine.register('wordle', { sides = { 'a', 'b' }, title = 'Wordle', currency = 'bank', rules = require 'server.games.rules.wordle' })
