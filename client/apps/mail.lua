---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

-- Thin delegates into server/mail: account session, mailbox listing, composing, drafts,
-- flags and folder moves.
proxyCallback('sd-phone:mail:list',       'sd-phone:server:mail:list')
proxyCallback('sd-phone:mail:signUp',     'sd-phone:server:mail:signUp')
proxyCallback('sd-phone:mail:signIn',     'sd-phone:server:mail:signIn')
proxyCallback('sd-phone:mail:signOut',    'sd-phone:server:mail:signOut')
proxyCallback('sd-phone:mail:send',       'sd-phone:server:mail:send')
proxyCallback('sd-phone:mail:saveDraft',  'sd-phone:server:mail:saveDraft')
proxyCallback('sd-phone:mail:markRead',   'sd-phone:server:mail:markRead')
proxyCallback('sd-phone:mail:toggleFlag', 'sd-phone:server:mail:toggleFlag')
proxyCallback('sd-phone:mail:moveToBin',  'sd-phone:server:mail:moveToBin')
proxyCallback('sd-phone:mail:discardDraft', 'sd-phone:server:mail:discardDraft')
proxyCallback('sd-phone:mail:move',       'sd-phone:server:mail:move')
proxyCallback('sd-phone:mail:deleteAccount', 'sd-phone:server:mail:deleteAccount')

---Server push: a mail landed in our signed-in inbox; relays it to the app.
---@param message table mail record from server/mail
RegisterNetEvent('sd-phone:client:mail:received', function(message)
    SendNUIMessage({ action = 'sd-phone:mail:received', data = message })
end)
