---@type table Cherry persistence layer (server.cherry.store): schema bootstrap + row CRUD.
local store   = require 'server.cherry.store'
---@type table Authoritative Cherry handlers (server.cherry.actions): validation + world mutation.
local actions = require 'server.cherry.actions'
-- Loaded for side effects: the /cherryseed + /cherryseedwipe admin commands self-register.
require 'server.cherry.seed'

-- Boot thread: creates the cherry tables (idempotent).
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:cherry]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:cherry]^0 schema ready')
end)

-- App callbacks: thin delegates into server.cherry.actions.
lib.callback.register('sd-phone:server:cherry:state', function(src) return actions.state(src) end)
lib.callback.register('sd-phone:server:cherry:saveProfile', function(src, payload) return actions.saveProfile(src, payload) end)
lib.callback.register('sd-phone:server:cherry:swipe', function(src, payload) return actions.swipe(src, payload) end)
lib.callback.register('sd-phone:server:cherry:rewind', function(src, payload) return actions.rewind(src, payload) end)
lib.callback.register('sd-phone:server:cherry:resetDeck', function(src) return actions.resetDeck(src) end)
lib.callback.register('sd-phone:server:cherry:thread', function(src, payload) return actions.thread(src, payload) end)
lib.callback.register('sd-phone:server:cherry:send', function(src, payload) return actions.send(src, payload) end)
lib.callback.register('sd-phone:server:cherry:react', function(src, payload) return actions.react(src, payload) end)
lib.callback.register('sd-phone:server:cherry:unmatch', function(src, payload) return actions.unmatch(src, payload) end)
lib.callback.register('sd-phone:server:cherry:block', function(src, payload) return actions.block(src, payload) end)
lib.callback.register('sd-phone:server:cherry:blockedList', function(src) return actions.blockedList(src) end)
lib.callback.register('sd-phone:server:cherry:unblock', function(src, payload) return actions.unblock(src, payload) end)

---Toggles the caller's watch flag: on-screen watchers get in-app match overlays instead of
---banner notifications. The flag is coerced to a strict boolean.
---@param payload table { on: boolean }
lib.callback.register('sd-phone:server:cherry:watch', function(src, payload)
    payload = payload or {}
    actions.setWatch(src, payload.on == true)
    return { success = true }
end)

lib.callback.register('sd-phone:server:cherry:deleteAccount', function(src) return actions.deleteAccount(src) end)
