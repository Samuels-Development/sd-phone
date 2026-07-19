-- Every online game (chess, connectfour, battleship, wordle) plus Rail Runner's single-player
-- profile (rr* actions: high scores, coin wallet, cosmetics) shares this one bridge into the
-- generic games engine.
---@type string[] NUI action suffixes proxied 1:1 to sd-phone:server:games:<action>.
local ACTIONS = {
    'createLobby', 'lobbies', 'joinLobby', 'inviteLobby', 'declineInvite',
    'leaveLobby', 'kickMember', 'setWager', 'setReady', 'setupReady', 'returnToLobby', 'startLobby', 'pending', 'move',
    'resign', 'finish', 'report', 'stats', 'record', 'leaderboard', 'submitScore', 'scoreboard',
    'chipsGet', 'chipsBuy', 'chipsSell',
    'bjDeal', 'bjHit', 'bjStand', 'bjDouble',
    'rrProfile', 'rrSubmit', 'rrBuy', 'rrSelect', 'rrLeaderboard',
}

-- Thin delegates into the games engine (server/games/engine.lua).
for _, name in ipairs(ACTIONS) do
    RegisterNUICallback('sd-phone:games:' .. name, function(payload, cb)
        local result = lib.callback.await('sd-phone:server:games:' .. name, false, payload)
        cb(result or { success = false, message = 'No response from server' })
    end)
end

---Server push: one channel carries every game's events; fans out to a per-game NUI action.
---@param data table { game: string, action: string, data?: table } from server/games/engine.lua
RegisterNetEvent('sd-phone:client:games', function(data)
    if not data or not data.game or not data.action then return end
    SendNUIMessage({ action = data.game .. ':' .. data.action, data = data.data or {} })
end)
