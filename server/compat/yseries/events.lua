
-- Each handler listens on a first-party 'sd-phone:server:*' lifecycle event and re-fires it under
-- the YSeries event name with the payload reshaped to YSeries' documented contract. Server-local
-- only, so these are AddEventHandler rather than RegisterNetEvent, exactly as YSeries documents.

---Encodes an attachment list the way YSeries hands it to listeners: a JSON-encoded STRING rather
---than a table. Nil when there is nothing to attach.
---@param list any
---@return string|nil
local function attachments(list)
    if type(list) ~= 'table' or next(list) == nil then return nil end
    return json.encode(list)
end

---1:1 and system texts -> yseries:server:messages:sent. Group sends are skipped: YSeries carries
---group recipients in `participants`, but sd-phone's group payload does not name them individually.
---
---channelId is the synthetic 0 the export half also reports, sd-phone having no channel concept.
AddEventHandler('sd-phone:server:messages:sent', function(m)
    if m.group then return end

    local media
    if (m.kind == 'image' or m.kind == 'gif') and m.meta and m.meta.gifUrl then
        media = { m.meta.gifUrl }
    end

    TriggerEvent('yseries:server:messages:sent', {
        messageId    = tostring(m.messageId or m.mid or ''),
        channelId    = '0',
        sender       = m.senderNumber,
        senderImei   = m.citizenid,
        content      = m.body,
        attachments  = attachments(media),
        participants = m.targetNumber,
        timestamp    = tostring(os.time()),
        targetSource = m.targetSource,
    })
end)

---Photo deletion -> yseries:server:gallery:on-photo-deleted (data, playerIdentifier).
---
---`permanent` is always true: sd-phone deletes the row outright rather than moving it to a recycle
---bin, so a listener that only purges remote storage on a permanent delete still fires.
AddEventHandler('sd-phone:server:photos:deleted', function(p)
    TriggerEvent('yseries:server:gallery:on-photo-deleted', {
        id           = p.id,
        phoneImei    = p.citizenid,
        image        = p.url,
        thumbnail    = nil,
        source       = nil,
        permanent    = true,
        playerSource = p.source,
    }, p.citizenid)
end)

---Birdy post -> yseries:server:y:new-tweet (tweetData, playerIdentifier).
AddEventHandler('sd-phone:server:birdy:post', function(p)
    TriggerEvent('yseries:server:y:new-tweet', {
        id          = p.id,
        username    = p.username,
        content     = p.body,
        attachments = attachments(p.images),
        replyTo     = nil,
    }, p.citizenid)
end)

---Photogram post -> yseries:server:instashots:on-new-post (postData, playerIdentifier).
AddEventHandler('sd-phone:server:photogram:post', function(p)
    TriggerEvent('yseries:server:instashots:on-new-post', {
        id          = p.id,
        username    = p.username,
        caption     = p.caption,
        attachments = {
            media        = p.images or {},
            taggedPeople = {},
        },
    }, p.citizenid)
end)

---Marketplace listing -> yseries:server:ybuy:on-new-ad (adData, playerIdentifier).
AddEventHandler('sd-phone:server:marketplace:post', function(p)
    TriggerEvent('yseries:server:ybuy:on-new-ad', {
        title         = p.title,
        description   = p.body,
        category      = nil,
        price         = p.price,
        contactName   = nil,
        number        = p.number,
        allowMessages = true,
        allowCalls    = true,
        attachments   = attachments(p.images or (p.image and { p.image } or nil)),
    }, p.citizenid)
end)

---Yellow-pages post -> yseries:server:promoHub:on-new-ad (adData, playerIdentifier).
AddEventHandler('sd-phone:server:pages:post', function(p)
    TriggerEvent('yseries:server:promoHub:on-new-ad', {
        title         = p.title,
        description   = p.body,
        price         = p.price,
        contactNumber = p.number,
        contactName   = nil,
        attachments   = attachments(p.images or (p.image and { p.image } or nil)),
    }, p.citizenid)
end)

-- yseries:server:news:new-article has no counterpart: sd-phone's Weazel News publishes through
-- the postArticle export without firing a first-party lifecycle event, so there is nothing to
-- listen on. Add one at the publish site and this file can mirror it.
