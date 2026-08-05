---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

-- Thin delegates into server/accounts: the shared app-accounts engine (registration, login,
-- password resets, the saved-passwords vault) every account-based app authenticates through.
proxyCallback('sd-phone:accounts:register',     'sd-phone:server:accounts:register')
proxyCallback('sd-phone:accounts:login',        'sd-phone:server:accounts:login')
proxyCallback('sd-phone:accounts:logout',       'sd-phone:server:accounts:logout')
proxyCallback('sd-phone:accounts:signOutAll',   'sd-phone:server:accounts:signOutAll')
proxyCallback('sd-phone:accounts:capacity',     'sd-phone:server:accounts:capacity')
proxyCallback('sd-phone:accounts:me',           'sd-phone:server:accounts:me')
proxyCallback('sd-phone:accounts:signInOptions', 'sd-phone:server:accounts:signInOptions')
proxyCallback('sd-phone:accounts:switchable',   'sd-phone:server:accounts:switchable')
proxyCallback('sd-phone:accounts:switch',       'sd-phone:server:accounts:switch')
proxyCallback('sd-phone:accounts:requestReset', 'sd-phone:server:accounts:requestReset')
proxyCallback('sd-phone:accounts:confirmReset', 'sd-phone:server:accounts:confirmReset')
proxyCallback('sd-phone:accounts:changePassword', 'sd-phone:server:accounts:changePassword')
proxyCallback('sd-phone:accounts:suggestCode',  'sd-phone:server:accounts:suggestCode')
proxyCallback('sd-phone:accounts:myNumber',     'sd-phone:server:accounts:myNumber')
proxyCallback('sd-phone:accounts:myEmail',      'sd-phone:server:accounts:myEmail')
proxyCallback('sd-phone:accounts:savePassword',   'sd-phone:server:accounts:savePassword')
proxyCallback('sd-phone:accounts:listPasswords',  'sd-phone:server:accounts:listPasswords')
proxyCallback('sd-phone:accounts:deletePassword', 'sd-phone:server:accounts:deletePassword')
