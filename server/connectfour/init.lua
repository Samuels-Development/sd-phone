---@type table Online-game engine (server.games.engine): lobbies, invites, sessions, wagers, stats.
local engine = require 'server.games.engine'

-- Connect Four online: Red(1)/Yellow(2) sides, Red moves first. The rules hold the board and call
-- four in a row and the full-board draw.
engine.register('connectfour', { sides = { '1', '2' }, title = 'Connect Four', rules = require 'server.games.rules.connectfour' })
