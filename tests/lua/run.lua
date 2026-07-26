package.path = 'tests/lua/?.lua;' .. package.path
local H = require 'support.harness'

local suites = {
    'port_settings_test',
    'port_photogram_test',
    'port_mail_test',
    'port_wallet_test',
    'port_reactions_test',
    'port_voicememos_test',
    'port_sessions_test',
    'idempotency_test',
}

for _, name in ipairs(suites) do
    local ok, err = pcall(require, name)
    if not ok then
        print(('SUITE ERROR %s: %s'):format(name, err))
        H.failed = H.failed + 1
    end
end

H.report()
