---@type table Online-game engine (server.games.engine): lobbies, invites, move relay, wagers, stats.
local engine = require 'server.games.engine'

-- Chess online: the generalized engine with White/Black sides, White moves first.
engine.register('chess', { sides = { 'w', 'b' }, title = 'Chess' })
