---@type table Online-game engine (server.games.engine): lobbies, invites, move relay, wagers, stats.
local engine = require 'server.games.engine'

-- Connect Four online: the generalized engine with Red(1)/Yellow(2) sides, Red moves first.
engine.register('connectfour', { sides = { '1', '2' }, title = 'Connect Four' })
