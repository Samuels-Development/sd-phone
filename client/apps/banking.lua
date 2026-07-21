---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'

-- Thin delegates into server/banking: the account overview and phone transfers.
proxy('sd-phone:banking:overview', 'sd-phone:server:banking:overview')
proxy('sd-phone:banking:send',     'sd-phone:server:banking:send')

-- Person-to-person invoicing (server/services/invoices.lua personal handlers).
proxy('sd-phone:banking:invoices:create', 'sd-phone:server:banking:invoices:create')
proxy('sd-phone:banking:invoices:sent',   'sd-phone:server:banking:invoices:sent')
proxy('sd-phone:banking:invoices:cancel', 'sd-phone:server:banking:invoices:cancel')

---Server push: another player transferred money to us; relays it to the Wallet.
---@param data table { amount, from } from server/banking/actions.lua
RegisterNetEvent('sd-phone:client:bankReceived', function(data)
    SendNUIMessage({ action = 'sd-phone:bank:received', data = data })
end)

---Server push: a transaction was recorded outside the app (an external debit/credit); nudges
---the Wallet to refetch.
RegisterNetEvent('sd-phone:client:bankTxAdded', function()
    SendNUIMessage({ action = 'sd-phone:bank:txAdded' })
end)
