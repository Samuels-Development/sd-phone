---@type table Shared shim helpers (server.compat.roadphone.shared): stub registration + warn-once.
local shim = require 'server.compat.roadphone.shared'

local stubExport, stubMeta = shim.stubExport, shim.stubMeta

-- RoadID is a phone-wide cloud account a player signs into and carries between devices. sd-phone
-- has no such account: each app signs in on its own through the accounts engine, and the only
-- phone-wide "cloud" is a per-device backup snapshot with no session behind it. A resource wanting
-- the account behind a player should ask per app instead - exports['sd-phone']:getSessionAccount(app,
-- citizenid) answers for mail, birdy, photogram, cherry, vibez and ryde.
---@type string The clause the RoadID family shares.
local WHY = 'has no sd-phone counterpart: there is no phone-wide cloud account, apps signing in individually through getSessionAccount(app, citizenid) instead'

stubExport('GetCloudAccountForSource', nil, WHY)
stubExport('GetCloudSource', nil, WHY)

-- The legacy account-metadata family is the pre-session RoadID blob RoadPhone's own docs say not to
-- build on. Reads report no stored account and writes report they stored nothing, which is what a
-- caller sees on a RoadPhone install that has already moved to the session API.
stubMeta('GetPhoneAccountFromMetadata', nil, 'the legacy RoadID account blob has no sd-phone counterpart')
stubMeta('SetPhoneAccountInMetadata', false, 'the legacy RoadID account blob has no sd-phone counterpart')
stubMeta('UpdatePhoneAccountInMetadata', false, 'the legacy RoadID account blob has no sd-phone counterpart')
stubMeta('ClearPhoneAccountFromMetadata', false, 'the legacy RoadID account blob has no sd-phone counterpart')
