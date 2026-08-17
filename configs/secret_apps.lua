-- Secret apps: unlocked by using an item, never by the App Store or the home screen grid.
-- See the `secretapp` note at the bottom of configs/apps.lua for how this differs from a normal
-- app entry, and server/secretapps/init.lua + client/secretapps.lua for how it's wired up.
--
-- Fields:
--   Core (all secret apps):
--     id          = '<slug>'   unique app id (letters/numbers/_-, matches a normal app id)
--     label       = '<name>'   display name shown once unlocked
--     secretapp   = '<item>'   inventory item id that unlocks this app when used
--     description = '<text>'   optional, shown on the app's tile/detail view
--
--   External / Third-Party Resource only (NOT needed if app is built directly into sd-phone):
--     resource    = '<name>'   owning resource name (handles lifecycle & cleanup when resource stops)
--     ui          = '<path>'   iframe URL/path served by the external resource (e.g. 'my_resource/ui/dist/index.html')
--     icon        = '<url>'    custom tile icon (e.g. 'https://cfx-nui-my_resource/ui/dist/icon.webp')
--
-- The inventory item itself still has to exist and point back here - see the item snippet in
-- server/secretapps/init.lua's header comment.
return {
    Apps = {},
}
