---@type table Cases (client.cases): the case this player wears and the style of their phone.
local cases = require 'client.cases'
---@type table Hold pose (client.pose): the frame colour of the phone in hand.
local pose = require 'client.pose'
---@type table Cases rules (shared.cases): the palette the trims are coloured from.
local rules = require 'shared.cases'

---Records the case the server says is on the phone and re-dresses the phone in hand.
---@param design any the server's `equipped`: a design, or false for none
local function adopt(design)
    cases.set(design)
    TriggerEvent('sd-phone:client:cases:changed')
end

---Asks the server something about this character's case. These calls do not go through the
---phone's network gate: a case is on the phone, not on the network, so it works with no signal.
---@param event string the server callback, after 'sd-phone:server:cases:'
---@return table envelope
local function ask(event)
    local res = lib.callback.await('sd-phone:server:cases:' .. event, false)
    return type(res) == 'table' and res or { success = false, message = 'No answer from the server' }
end

---What the case page in Settings shows: the case on the phone and the frame colour in hand.
---@param _ table unused
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:cases:phone', function(_, cb)
    local res = ask('equipped')
    local frame = pose.frame()
    if res.success ~= true or type(res.data) ~= 'table' then
        local empty = { palette = rules.data.Palette, styles = {}, patterns = {}, accessories = {}, charms = {}, stickers = {} }
        cb({ success = true, data = {
            phone = cases.styleOptions(), equipped = false, frame = frame, blocked = cases.blocked(frame), items = false,
            catalog = empty, body = pose.shutBody(), look = pose.look(),
        } })
        return
    end
    cases.set(res.data.equipped)
    res.data.phone = cases.styleOptions()
    res.data.frame = frame
    res.data.blocked = cases.blocked(frame)
    res.data.body = pose.shutBody()
    res.data.look = pose.look()
    cb(res)
end)

---Takes the case off the phone.
---@param _ table unused
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:cases:takeoff', function(_, cb)
    local res = ask('takeoff')
    if res.success == true then adopt(false) end
    cb(res)
end)

---@type table Locale (bridge.shared.locale): the words on the menus.
local locale = require 'bridge.shared.locale'
---@type table Notify bridge (bridge.client.notify): what a menu has to say when it cannot open.
local notify = require 'bridge.client.notify'
---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type string? The inventory resource in use (bridge.shared.inventory_id).
local inventoryName = require('bridge.shared.inventory_id').name

---What this player has to dress their phones with, as the server holds it.
---@return { phones: table[], cases: table[] }? wardrobe nil, with a word to the player, when there is nothing to show
local function wardrobe()
    local res = lib.callback.await('sd-phone:server:cases:wardrobe', false)
    if type(res) ~= 'table' or res.success ~= true or type(res.data) ~= 'table' then
        notify.show(type(res) == 'table' and res.message or locale.t('cases.menuUnavailable', 'Phone cases are not available'), 'error')
        return nil
    end
    return { phones = res.data.phones or {}, cases = res.data.cases or {} }
end

---Finds an entry by its slot.
---@param list table[]
---@param slot any
---@return table?
local function inSlot(list, slot)
    for i = 1, #list do
        if tostring(list[i].slot) == tostring(slot) then return list[i] end
    end
    return nil
end

---What a phone's line in a menu says about its case.
---@param phone table a wardrobe phone
---@return string
local function caseLine(phone)
    if phone.cased then return locale.t('cases.chooseCased', 'Comes in its own case') end
    if phone.wearing then return locale.t('cases.chooseWearing', 'Has on: {case}', { case = phone.wearing }) end
    return locale.t('cases.chooseBare', 'No case on it')
end

---What a phone is called in a menu.
---@param phone table a wardrobe phone
---@return string
local function phoneTitle(phone)
    return phone.inUse and locale.t('cases.chooseInUse', '{phone} (in use)', { phone = phone.label }) or phone.label
end

---Lists the phones to put one case on. With one phone that can take it, it goes straight on.
---@param caseSlot any the slot of the case item
local function pickPhone(caseSlot)
    local have = wardrobe()
    if not have then return end
    if not inSlot(have.cases, caseSlot) then
        notify.show(locale.t('cases.menuCaseGone', 'You no longer have that case'), 'error')
        return
    end
    if #have.phones == 0 then
        notify.show(locale.t('cases.menuNoPhone', 'You need a phone to put it on'), 'error')
        return
    end
    if #have.phones == 1 then
        lib.callback.await('sd-phone:server:cases:fit', false, { case = caseSlot, phone = have.phones[1].slot })
        return
    end

    local options = {}
    for i, phone in ipairs(have.phones) do
        options[i] = {
            title       = phoneTitle(phone),
            description = caseLine(phone),
            icon        = 'mobile-screen-button',
            disabled    = phone.cased == true,
            onSelect    = function()
                lib.callback.await('sd-phone:server:cases:fit', false, { case = caseSlot, phone = phone.slot })
            end,
        }
    end
    lib.registerContext({
        id      = 'sd-phone:cases:pickPhone',
        title   = locale.t('cases.chooseTitle', 'Put the case on which phone?'),
        options = options,
    })
    lib.showContext('sd-phone:cases:pickPhone')
end

---Shows what can be done to one phone's case: take off the one it has, or fit one from the pockets.
---@param phoneSlot any the slot of the phone
---@param back string? the menu to go back to
local function phoneMenu(phoneSlot, back)
    local have = wardrobe()
    if not have then return end
    local phone = inSlot(have.phones, phoneSlot)
    if not phone then
        notify.show(locale.t('cases.menuNoPhone', 'You need a phone to put it on'), 'error')
        return
    end

    local options = {}
    if phone.cased then
        options[1] = { title = locale.t('cases.chooseCased', 'Comes in its own case'), icon = 'ban', disabled = true }
    else
        if phone.wearing then
            options[#options + 1] = {
                title       = locale.t('cases.menuTakeOff', 'Take the case off'),
                description = phone.wearing,
                icon        = 'arrow-up-from-bracket',
                onSelect    = function()
                    local res = lib.callback.await('sd-phone:server:cases:takeoff', false, { phone = phone.slot })
                    if type(res) == 'table' and res.success == true then
                        notify.show(locale.t('cases.menuTookOff', 'The case is back in your pockets'), 'success')
                    else
                        notify.show(type(res) == 'table' and res.message or locale.t('cases.menuUnavailable', 'Phone cases are not available'), 'error')
                    end
                end,
            }
        end
        for _, loose in ipairs(have.cases) do
            options[#options + 1] = {
                title       = locale.t('cases.menuPutOn', 'Put on: {case}', { case = loose.about }),
                description = phone.wearing and locale.t('cases.menuSwaps', 'The one it has on comes back to your pockets') or nil,
                icon        = 'mobile-screen-button',
                onSelect    = function()
                    lib.callback.await('sd-phone:server:cases:fit', false, { case = loose.slot, phone = phone.slot })
                end,
            }
        end
        if #options == 0 then
            options[1] = {
                title       = locale.t('cases.menuNothing', 'No case on it, and none in your pockets'),
                description = locale.t('cases.menuBuy', 'Cases are made at phone case stores'),
                icon        = 'store',
                disabled    = true,
            }
        end
    end
    lib.registerContext({
        id      = 'sd-phone:cases:phone',
        title   = phone.label,
        menu    = back,
        options = options,
    })
    lib.showContext('sd-phone:cases:phone')
end

---Lists every phone the player carries, each opening what can be done to its case.
local function phonesMenu()
    local have = wardrobe()
    if not have then return end
    if #have.phones == 0 then
        notify.show(locale.t('cases.menuNoPhones', 'You have no phone on you'), 'error')
        return
    end
    if #have.phones == 1 then return phoneMenu(have.phones[1].slot) end

    local options = {}
    for i, phone in ipairs(have.phones) do
        options[i] = {
            title       = phoneTitle(phone),
            description = caseLine(phone),
            icon        = 'mobile-screen-button',
            arrow       = true,
            onSelect    = function() phoneMenu(phone.slot, 'sd-phone:cases:phones') end,
        }
    end
    lib.registerContext({
        id      = 'sd-phone:cases:phones',
        title   = locale.t('cases.menuTitle', 'Phone cases'),
        options = options,
    })
    lib.showContext('sd-phone:cases:phones')
end

---The player used a case item while carrying several phones: asks which phone it goes on.
---@param caseSlot any the slot of the case item
RegisterNetEvent('sd-phone:client:cases:choosePhone', function(caseSlot)
    if type(source) ~= 'number' then return end
    pickPhone(caseSlot)
end)

---Public exports, made for an inventory's item buttons (see the README): put a case item on a
---phone, open what can be done to one phone's case, take a phone's case off, and the whole list.
---Each takes the inventory slot the button was pressed on.
exports('fitPhoneCase', function(slot) CreateThread(function() pickPhone(slot) end) end)
exports('openPhoneCaseMenu', function(slot)
    CreateThread(function()
        if slot ~= nil then phoneMenu(slot) else phonesMenu() end
    end)
end)
exports('takePhoneCaseOff', function(slot)
    CreateThread(function()
        local res = lib.callback.await('sd-phone:server:cases:takeoff', false, { phone = slot })
        if type(res) == 'table' and res.success == true then
            notify.show(locale.t('cases.menuTookOff', 'The case is back in your pockets'), 'success')
        else
            notify.show(type(res) == 'table' and res.message or locale.t('cases.menuUnavailable', 'Phone cases are not available'), 'error')
        end
    end)
end)

-- The command that opens the list, for inventories with no buttons on their items. ox_inventory has
-- them, so there the command is only registered when asked for (configs/cases.lua CommandAlways).
do
    local cfg = config.Cases or {}
    local name = cfg.Command
    if cfg.Enabled ~= false and type(name) == 'string' and name ~= ''
        and (cfg.CommandAlways == true or inventoryName ~= 'ox_inventory') then
        RegisterCommand(name, function() phonesMenu() end, false)
    end
end

---The server changed the case on this character's phone: bought and put on at a store, put on from
---the inventory, or taken off.
---@param design any a design, or false for none
RegisterNetEvent('sd-phone:client:cases:set', function(design)
    adopt(design)
end)
