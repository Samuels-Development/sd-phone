---@type table Online-game engine (server.games.engine): lobbies, invites, move relay, wagers, stats.
local engine = require 'server.games.engine'

-- Battleship online: the generalized engine with two sides ('1' goes first), opaque shot/result relay.
engine.register('battleship', { sides = { '1', '2' }, title = 'Battleship' })
