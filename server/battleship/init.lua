---@type table Online-game engine (server.games.engine): lobbies, invites, move relay, wagers, stats.
local engine = require 'server.games.engine'

-- Battleship online: the generalized engine with two sides ('1' goes first), opaque shot/result
-- relay. `requiresSetup` holds every shot until BOTH players have reported their fleet placed -
-- without it the first player to deploy could fire into a board still being shuffled.
engine.register('battleship', { sides = { '1', '2' }, title = 'Battleship', requiresSetup = true })
