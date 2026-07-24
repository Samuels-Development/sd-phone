-- docs/ox_inventory_items.lua — copy-paste templates for ox_inventory/data/items.lua
-- (not loaded by the resource; reference only).
--
-- Pick EXACTLY one phone variant to match configs/uniquephones.lua:
--
--   UseContainers = true  -> SECTION A (includes "SIM Tray" button)
--   UseContainers = false -> SECTION B (no button; install SIM by using sim_card)
--
-- USE the phone always opens the phone UI (client.export = sd-phone.usePhone).
-- Blank sim_card: USE once to activate a number, then tray-insert (A) or use again (B).

--[[

----------------------------------------------------------------------
-- SECTION A — UseContainers = true  (SIM tray stash + inventory button)
----------------------------------------------------------------------

['phone'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
    },
    buttons = {
        {
            label = 'SIM Tray',
            action = function(slot)
                exports['sd-phone']:openSimTray(slot)
            end,
        },
    },
},

['phone_blue'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_blue.png',
    },
    buttons = {
        {
            label = 'SIM Tray',
            action = function(slot)
                exports['sd-phone']:openSimTray(slot)
            end,
        },
    },
},

['phone_green'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_green.png',
    },
    buttons = {
        {
            label = 'SIM Tray',
            action = function(slot)
                exports['sd-phone']:openSimTray(slot)
            end,
        },
    },
},

['phone_orange'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_orange.png',
    },
    buttons = {
        {
            label = 'SIM Tray',
            action = function(slot)
                exports['sd-phone']:openSimTray(slot)
            end,
        },
    },
},

['phone_pink'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_pink.png',
    },
    buttons = {
        {
            label = 'SIM Tray',
            action = function(slot)
                exports['sd-phone']:openSimTray(slot)
            end,
        },
    },
},

['phone_purple'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_purple.png',
    },
    buttons = {
        {
            label = 'SIM Tray',
            action = function(slot)
                exports['sd-phone']:openSimTray(slot)
            end,
        },
    },
},

['phone_red'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_red.png',
    },
    buttons = {
        {
            label = 'SIM Tray',
            action = function(slot)
                exports['sd-phone']:openSimTray(slot)
            end,
        },
    },
},

['phone_yellow'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_yellow.png',
    },
    buttons = {
        {
            label = 'SIM Tray',
            action = function(slot)
                exports['sd-phone']:openSimTray(slot)
            end,
        },
    },
},

----------------------------------------------------------------------
-- SECTION B — UseContainers = false  (metadata SIM install; NO tray button)
----------------------------------------------------------------------

['phone'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
    },
},

['phone_blue'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_blue.png',
    },
},

['phone_green'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_green.png',
    },
},

['phone_orange'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_orange.png',
    },
},

['phone_pink'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_pink.png',
    },
},

['phone_purple'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_purple.png',
    },
},

['phone_red'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_red.png',
    },
},

['phone_yellow'] = {
    label = 'Phone',
    weight = 190,
    stack = false,
    close = true,
    consume = 0,
    client = {
        export = 'sd-phone.usePhone',
        image = 'phone_yellow.png',
    },
},

----------------------------------------------------------------------
-- SIM card (same for both modes)
----------------------------------------------------------------------

['sim_card'] = {
    label = 'SIM Card',
    weight = 10,
    stack = false,
    close = true,
    consume = 0,
    client = {
        image = 'sim_card.png',
        export = 'sd-phone.useSimCard',
    },
    server = {
        export = 'sd-phone.useSim_card',
    },
},

]]
