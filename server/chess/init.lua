---@type table Online-game engine (server.games.engine): lobbies, invites, sessions, wagers, stats.
local engine = require 'server.games.engine'

-- Chess online: White/Black sides, White moves first. The rules check every move for legality and
-- call checkmate, stalemate and dead positions.
engine.register('chess', { sides = { 'w', 'b' }, title = 'Chess', rules = require 'server.games.rules.chess' })
