---@type table Messages handlers (server.messages.actions): systemText for targeted SMS delivery.
local msgActions = require 'server.messages.actions'

---@type table|nil Mail handlers (server.mail.actions), resolved lazily inside sendCodeEmail.
local mailActions

---@type table Delivery module; the table returned at end of file.
local delivery = {}

-- Per-app delivery identity: SMS short code and display name.
---@type table<string, { name: string, code: string }> Sender identity per account app.
local APPS = {
    photogram = { name = 'Photogram', code = '74682' },
    cherry    = { name = 'Cherry',    code = '24377' },
    vibez     = { name = 'Vibez',     code = '84239' },
    birdy     = { name = 'Birdy',     code = '24739' },
    mail      = { name = 'Mail',      code = '62450' },
    ryde      = { name = 'Ryde',      code = '79333' },
}

---Pretty display name for an app, falling back to the raw key for apps with no delivery identity.
---@param app string account app key
---@return string label
function delivery.appLabel(app)
    return APPS[app] and APPS[app].name or app
end

---Delivers a verification mail to `email`'s inbox through server.mail.actions.systemSend.
---Returns false when the app has no delivery identity or the mailbox no longer exists.
---@param email string recipient mail address
---@param app string account app key
---@param code string 6-digit reset code
---@return boolean delivered
function delivery.sendCodeEmail(email, app, code)
    local meta = APPS[app]; if not meta then return false end
    mailActions = mailActions or require 'server.mail.actions'
    local result = mailActions.systemSend({
        to      = { email },
        from    = { name = meta.name, email = ('no-reply@%s.ls'):format(app) },
        subject = ('Your %s verification code'):format(meta.name),
        body    = ('Your %s password reset code is %s. It expires in 10 minutes. If you did not request this, ignore this email.'):format(meta.name, code),
    })
    if not result.success or not result.data then return false end
    return (result.data.delivered or 0) > 0
end

---Texts a verification code to `phone` from the app's short code. Returns false when the number
---is not active or the app has no delivery identity.
---@param phone string recipient phone number (digits)
---@param app string account app key
---@param code string 6-digit reset code
---@return boolean delivered
function delivery.sendCodeSms(phone, app, code)
    local meta = APPS[app]; if not meta then return false end
    local body = ('Your %s code is %s. It expires in 10 minutes.'):format(meta.name, code)
    return msgActions.systemText(meta.code, meta.name, phone, body)
end

return delivery
