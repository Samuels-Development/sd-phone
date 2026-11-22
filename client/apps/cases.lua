---@type fun(nuiAction: string, serverEvent: string, onAccepted?: fun(), transform?: fun(res: table)) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'
---@type table Cases (client.cases): the case this player wears, and try-ons.
local cases = require 'client.cases'
---@type table Hold pose (client.pose): the frame colour of the phone in hand.
local pose = require 'client.pose'

---Takes the server's word for which case is worn out of a successful answer, and re-dresses the
---phone in hand when it changed.
---@param res table a successful envelope carrying `data.equipped`
local function adopt(res)
    if type(res.data) ~= 'table' or res.data.equipped == nil then return end
    cases.set(res.data.equipped)
    TriggerEvent('sd-phone:client:cases:changed')
end

---Completes the app's opening state with what only this client knows: the frame colour in hand,
---and whether that phone already comes in a case.
---@param res table a successful `state` envelope
local function withFrame(res)
    adopt(res)
    if type(res.data) ~= 'table' then return end
    res.data.frame = pose.frame()
    res.data.blocked = cases.blocked(res.data.frame)
    res.data.phone = cases.styleOptions()
end

-- Thin delegates into server/cases; every answer that names the equipped case is adopted.
proxy('sd-phone:cases:state',  'sd-phone:server:cases:state',  nil, withFrame)
proxy('sd-phone:cases:buy',    'sd-phone:server:cases:buy',    nil, adopt)
proxy('sd-phone:cases:equip',  'sd-phone:server:cases:equip',  nil, adopt)
proxy('sd-phone:cases:remove', 'sd-phone:server:cases:remove', nil, adopt)

---Sets the design and trims of this player's own phone, and re-dresses the phone in hand.
---@param data table { style?: PhoneStyle|false } false or nothing goes back to the classic phone
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:cases:style', function(data, cb)
    cases.setStyle(type(data) == 'table' and data.style or nil)
    TriggerEvent('sd-phone:client:cases:changed')
    cb({ success = true, data = cases.styleOptions() })
end)

---Tries a design on the phone in hand without buying it. `design = false` tries on no case, and
---leaving it out goes back to the case being worn.
---@param data table { design?: CaseDesign|false }
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:cases:preview', function(data, cb)
    cases.preview(type(data) == 'table' and data.design or nil)
    TriggerEvent('sd-phone:client:cases:changed')
    cb({ ok = true })
end)
