---@type table Online-game engine (server.games.engine): lobbies, invites, sessions, wagers, stats.
local engine = require 'server.games.engine'

-- Battleship online: two sides ('1' fires first). The rules hold both fleets from deployment on and
-- resolve every shot, and no shot lands until both fleets are down.
engine.register('battleship', { sides = { '1', '2' }, title = 'Battleship', rules = require 'server.games.rules.battleship' })
