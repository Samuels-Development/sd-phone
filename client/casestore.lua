---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Cases (client.cases): dresses a phone prop in a case, and holds the one this player wears.
local cases = require 'client.cases'
---@type table Hold pose (client.pose): the phone model this player holds, and its frame colour.
local pose = require 'client.pose'
---@type table Target bridge (bridge.client.target): the "talk to the clerk" option.
local target = require 'bridge.client.target'
---@type table Notify bridge (bridge.client.notify): refusals shown outside the store screen.
local notify = require 'bridge.client.notify'
---@type table Locale (bridge.shared.locale): the labels drawn in the world.
local locale = require 'bridge.shared.locale'
---@type table Cases rules (shared.cases): the palette a case's colours are rows of.
local rules = require 'shared.cases'

---@type table Case store module; the table returned at end of file. A case store is a clerk in the
---world. Talking to them stands the player's own phone in front of a camera, where it turns under
---the mouse and wears whatever the customizer beside it has picked, charm swinging and all.
local casestore = {}

---@type table Cases config (config.Cases): the stores, their blip and the buying radius.
local CFG <const> = config.Cases or {}
---@type table[] The stores; none when cases are switched off.
local STORES <const> = CFG.Enabled ~= false and type(CFG.Stores) == 'table' and CFG.Stores or {}
---@type number Metres from a clerk at which they are created; they go again a little further out.
local PED_RANGE <const> = 60.0
---@type number Metres within which the store can be opened without a target resource.
local USE_RANGE <const> = 2.2
---@type number Metres in front of the clerk at which the phone stands.
local STAND_OFF <const> = 0.8
---@type number Metres above the clerk's own position at which the phone stands.
local STAND_UP <const> = 0.45
---@type number The camera's field of view, in degrees.
local FOV <const> = 30.0
---@type number Share of the screen's width the customizer covers on the right; the phone is centred in the rest.
local PANEL_SHARE <const> = 0.26
---@type number, number Nearest and furthest the camera gets to the phone, in metres.
local DIST_MIN <const>, DIST_MAX <const> = 0.30, 0.95
---@type number Degrees the phone can be tipped towards or away from the camera.
local PITCH_MAX <const> = 40.0
---@type string The booth sd-phone-props streams to stand the phone in: walls, a pedestal and lit
---accents, with the phone's place at its origin and the camera looking down its +Y.
local STUDIO <const> = 'sd_case_studio'
---@type vector3 Where the studio stands: deep under the hills, where nothing of the map can push
---through its walls and no rain, cloud or daylight reaches. The player stays at the store; only the
---camera goes down.
local STUDIO_AT <const> = vector3(0.0, 800.0, -100.0)
---@type string, string The studio's texture dictionary and the texture its screen wall shows, which a
---live page replaces while a store is open.
local WALL_TXD <const>, WALL_TEX <const> = 'sd_case_studio', 'sd_studio_screen'
---@type integer, integer Pixels the screen wall's page is drawn at.
local WALL_W <const>, WALL_H <const> = 2048, 1024
---@type number[] Where on the screen wall the phone stands as the camera sees it, from its top left.
local WALL_FOCUS <const> = { 0.458, 0.75 }
---@type string The colour the screen wall glows in until a case gives it one.
local WALL_ACCENT <const> = '#F5A524'
---@type string The streamed dictionary the phones' screens come from (sd-phone-props).
local PHONE_TXD <const> = 'sd_phone_shared'
---@type string[] Every screen a phone model can show; all of them go dark while a phone is on show.
local PHONE_SCREENS <const> = {
    'sd_phone_screen', 'sd_phone_fold_cover', 'sd_phone_fold_screen',
    'sd_slate_screen', 'sd_slate_fold_cover', 'sd_slate_fold_screen',
}
---@type string The runtime dictionary this file's own textures live in.
local RUNTIME <const> = 'sd_case_studio_rt'
---@type integer? The runtime dictionary's handle, once something needed it.
local runtime
---@type boolean True once the black texture a switched-off screen shows has been drawn.
local blackReady = false
---@type integer Counts screen walls, so each one's page gets a texture name of its own.
local wallSeq = 0
---@type table<string, { yaw: number, pitch: number, dist: number, drop: number }> Where the phone turns
---to and how close the camera comes for each part being chosen; `drop` lowers the view, in metres.
local VIEWS <const> = {
    body      = { yaw = 30.0, pitch = 0.0,  dist = 0.58, drop = 0.0 },
    accessory = { yaw = 14.0, pitch = 0.0,  dist = 0.44, drop = 0.0 },
    sticker   = { yaw = 10.0, pitch = 0.0,  dist = 0.42, drop = 0.0 },
    charm     = { yaw = 28.0, pitch = -6.0, dist = 0.52, drop = 0.07 },
    trim      = { yaw = 24.0, pitch = 0.0,  dist = 0.38, drop = -0.035 },
}

---@type table<integer, integer> Store index -> its clerk, while the player is near.
local clerks = {}
---@type table? The store being browsed: its phone, camera and where both are heading.
local scene
---@type boolean True while a store is opening, so a second press does nothing.
local opening = false
---@type boolean True while a store is fading shut, so nothing opens or closes it a second time.
local closing = false
---@type integer, integer Milliseconds the screen takes to go black, and to come back. The studio is
---far from the store, so the camera never travels there: the screen goes dark, everything changes
---behind it, and it comes back on the finished picture.
local FADE_OUT <const>, FADE_IN <const> = 220, 420
---@type integer Milliseconds after the screen comes back during which the phone settles into place
---slowly rather than snapping.
local SETTLE_MS <const> = 1400

---The runtime dictionary, created on first use.
---@return integer txd
local function runtimeTxd()
    runtime = runtime or CreateRuntimeTxd(RUNTIME)
    return runtime
end

---Waits for a streamed texture dictionary, so a replacement made in it takes.
---@param name string
local function awaitDict(name)
    RequestStreamedTextureDict(name, false)
    local started = GetGameTimer()
    while not HasStreamedTextureDictLoaded(name) and GetGameTimer() - started < 2000 do Wait(25) end
end

---Switches every phone screen off on this client: a phone on show is looked at from behind, and a
---lit screen only throws light about. Other players are unaffected, and close() puts them back.
local function screensOff()
    if not blackReady then
        local tex = CreateRuntimeTexture(runtimeTxd(), 'off', 4, 4)
        for x = 0, 3 do
            for y = 0, 3 do SetRuntimeTexturePixel(tex, x, y, 0, 0, 0, 255) end
        end
        CommitRuntimeTexture(tex)
        blackReady = true
    end
    awaitDict(PHONE_TXD)
    for i = 1, #PHONE_SCREENS do AddReplaceTexture(PHONE_TXD, PHONE_SCREENS[i], RUNTIME, 'off') end
end

---Puts the phones' screens back on.
local function screensOn()
    for i = 1, #PHONE_SCREENS do RemoveReplaceTexture(PHONE_TXD, PHONE_SCREENS[i]) end
end

---Starts the page the studio's screen wall shows and puts its picture on the wall.
---@param name string the store's name, shown on the wall
---@param accent string '#rrggbb' the wall starts in
---@return integer? dui the page, nil when it would not start
local function startWall(name, accent)
    local url = ('nui://%s/web/dui/studio.html'):format(GetCurrentResourceName())
    local dui = CreateDui(url, WALL_W, WALL_H)
    local started = GetGameTimer()
    while not IsDuiAvailable(dui) and GetGameTimer() - started < 4000 do Wait(50) end
    if not IsDuiAvailable(dui) then
        DestroyDui(dui)
        return nil
    end
    wallSeq = wallSeq + 1
    local texture = ('wall_%d'):format(wallSeq)
    CreateRuntimeTextureFromDuiHandle(runtimeTxd(), texture, GetDuiHandle(dui))
    awaitDict(WALL_TXD)
    AddReplaceTexture(WALL_TXD, WALL_TEX, RUNTIME, texture)
    SendDuiMessage(dui, json.encode({ accent = accent, focus = WALL_FOCUS, name = name }))
    return dui
end

---The colour a design's shell is, for the screen wall and the lights to follow.
---@param design CaseDesign? a design that came out of cases.clean
---@return string hex '#rrggbb'
local function accentOf(design)
    return design and rules.data.Palette[design.color + 1] or WALL_ACCENT
end

---Deletes the phone on show, with everything dressing it.
---@param phone integer?
local function removePhone(phone)
    if not phone or not DoesEntityExist(phone) then return end
    cases.undress(phone)
    DeleteObject(phone)
end

---Fades the screen to black and waits until it is.
local function blackout()
    if IsScreenFadedOut() then return end
    DoScreenFadeOut(FADE_OUT)
    local started = GetGameTimer()
    while not IsScreenFadedOut() and GetGameTimer() - started < FADE_OUT + 600 do Wait(0) end
end

---Waits, behind a black screen, for the world round the player to be there again: the game had its
---attention on the studio, so the street would otherwise come back half built.
local function settle()
    local ped = cache.ped
    local at = GetEntityCoords(ped)
    ClearFocus()
    NewLoadSceneStartSphere(at.x, at.y, at.z, 60.0, 0)
    local started = GetGameTimer()
    while not IsNewLoadSceneLoaded() and GetGameTimer() - started < 2500 do Wait(0) end
    NewLoadSceneStop()
    started = GetGameTimer()
    while not HasCollisionLoadedAroundEntity(ped) and GetGameTimer() - started < 1500 do Wait(0) end
end

---Takes a store's scene apart at once: the phone, studio and camera go, and the player gets their
---view and controls back.
---@param s table the scene
local function teardown(s)
    removePhone(s.phone)
    if s.clerk and DoesEntityExist(s.clerk) then ResetEntityAlpha(s.clerk) end
    if s.studio then
        if DoesEntityExist(s.studio) then DeleteObject(s.studio) end
        NetworkClearClockTimeOverride()
    end
    if s.wall then
        RemoveReplaceTexture(WALL_TXD, WALL_TEX)
        DestroyDui(s.wall)
    end
    screensOn()
    RenderScriptCams(false, false, 0, true, false)
    DestroyCam(s.cam, false)
    ClearFocus()
    FreezeEntityPosition(cache.ped, false)
    DisplayRadar(s.radar)
end

---Leaves the store. The page goes first, then the screen fades to black, the scene is taken apart
---and the street is given time to load behind it, and the screen comes back on the player.
---@param tellPage boolean? true when the page has not asked for this itself and needs telling
---@param now boolean? true to skip the fade, for a resource that is stopping
local function close(tellPage, now)
    local s = scene
    if not s or closing then return end
    if tellPage then SendNUIMessage({ action = 'sd-phone:casestore:close' }) end
    SetNuiFocus(false, false)
    if now then
        scene = nil
        teardown(s)
        return
    end
    closing = true
    CreateThread(function()
        blackout()
        scene = nil
        teardown(s)
        settle()
        closing = false
        DoScreenFadeIn(FADE_IN)
    end)
end

---Moves `from` towards `to` by a share that does not depend on the frame rate.
---@param from number
---@param to number
---@param dt number seconds since the last frame
---@param rate number how quickly it closes the gap; 12 is brisk, 4 is a slow settle
---@return number
local function ease(from, to, dt, rate)
    return from + (to - from) * (1.0 - math.exp(-dt * rate))
end

---Runs the store's scene until it closes: turns the phone, moves the camera, lights both and keeps
---the game's own HUD, the player's body and the clerk out of the picture, so the store's wall is
---the backdrop.
---@param s table the scene
local function run(s)
    CreateThread(function()
        while scene == s do
            local dt = math.min(GetFrameTime(), 0.05)
            local rate = GetGameTimer() < s.settleUntil and 3.6 or 12.0
            s.yaw = ease(s.yaw, s.toYaw, dt, rate)
            s.pitch = ease(s.pitch, s.toPitch, dt, rate)
            s.dist = ease(s.dist, s.toDist, dt, rate)
            s.drop = ease(s.drop, s.toDrop, dt, rate)

            local visible = 2.0 * s.dist * math.tan(math.rad(FOV) / 2.0) * GetAspectRatio(false)
            local centre = s.centre - vector3(0.0, 0.0, s.drop)
            local aim = centre + s.right * (visible * PANEL_SHARE / 2.0)
            local eye = aim + s.fwd * s.dist
            SetCamCoord(s.cam, eye.x, eye.y, eye.z)
            PointCamAtCoord(s.cam, aim.x, aim.y, aim.z)
            SetCamNearDof(s.cam, s.dist * 0.55)
            SetCamFarDof(s.cam, s.dist * 1.6)
            SetUseHiDof()
            SetFocusPosAndVel(centre.x, centre.y, centre.z, 0.0, 0.0, 0.0)

            if DoesEntityExist(s.phone) then
                SetEntityRotation(s.phone, s.pitch, 0.0, s.heading + s.yaw, 2, true)
            end

            local key = eye + s.right * -0.35 + vector3(0.0, 0.0, 0.30)
            local fill = eye + s.right * 0.45 + vector3(0.0, 0.0, -0.10)
            if s.studio then
                local warm = s.centre - s.fwd * 0.30 + s.right * -0.32 + vector3(0.0, 0.0, 0.12)
                local cool = s.centre - s.fwd * 0.30 + s.right * 0.34 + vector3(0.0, 0.0, -0.04)
                DrawLightWithRange(key.x, key.y, key.z, 255, 246, 236, 1.1, 0.55)
                DrawLightWithRange(fill.x, fill.y, fill.z, 200, 215, 255, 1.0, 0.22)
                DrawLightWithRange(warm.x, warm.y, warm.z, 245, 165, 36, 0.6, 0.45)
                DrawLightWithRange(cool.x, cool.y, cool.z, 190, 215, 255, 0.6, 0.35)
                NetworkOverrideClockTime(0, 0, 0)
            else
                DrawLightWithRange(key.x, key.y, key.z, 255, 244, 228, 1.8, 2.2)
                DrawLightWithRange(fill.x, fill.y, fill.z, 190, 210, 255, 1.6, 0.7)
            end

            SetEntityLocallyInvisible(cache.ped)
            HideHudAndRadarThisFrame()

            if IsEntityDead(cache.ped) or #(GetEntityCoords(cache.ped) - s.origin) > 6.0 then
                close(true)
            end
            Wait(0)
        end
    end)
end

---Stands the player's phone up in front of the store's clerk and points a camera at it.
---@param shop table the store (config.Cases.Stores entry)
---@param design CaseDesign? the case it starts in
---@param frame string the frame colour of the phone to show
---@param fold boolean whether that phone is a foldable
---@param kind string that phone's design
---@return table? scene nil when no phone model would stream
local function stage(shop, design, frame, fold, kind)
    local at = shop.coords
    local blocked = cases.blocked(frame)
    local booth = joaat(STUDIO)
    local indoors = CFG.Studio ~= false and IsModelInCdimage(booth) and pcall(lib.requestModel, booth, 3000)

    local heading = indoors and 0.0 or (at.w or 0.0) + 0.0
    local turn = math.rad(heading)
    local fwd = vector3(-math.sin(turn), math.cos(turn), 0.0)
    local centre = indoors and STUDIO_AT or vector3(at.x, at.y, at.z) + fwd * STAND_OFF + vector3(0.0, 0.0, STAND_UP)

    local studio, wall
    if indoors then
        studio = CreateObjectNoOffset(booth, centre.x, centre.y, centre.z, false, true, true)
        SetEntityCollision(studio, false, false)
        FreezeEntityPosition(studio, true)
        SetEntityHeading(studio, heading + 180.0)
        SetModelAsNoLongerNeeded(booth)
        wall = startWall(shop.name or '', accentOf((not blocked) and design or nil))
    end

    local phone, body, look = pose.createLoose(centre, frame, (not blocked) and design or nil, cases.styleFor(kind), fold)
    if not phone then
        if studio then DeleteObject(studio) end
        if wall then
            RemoveReplaceTexture(WALL_TXD, WALL_TEX)
            DestroyDui(wall)
        end
        return nil
    end
    screensOff()

    local view = VIEWS.body
    local cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', centre.x, centre.y, centre.z, 0.0, 0.0, 0.0, FOV, false, 2)
    SetCamNearClip(cam, 0.03)
    SetCamUseShallowDofMode(cam, true)
    SetCamDofStrength(cam, 0.9)
    SetCamActive(cam, true)
    RenderScriptCams(true, false, 0, true, false)

    return {
        phone = phone, body = body, look = look, blocked = blocked, cam = cam, studio = studio, wall = wall,
        frame = frame, fold = fold, kind = kind, design = (not blocked) and design or nil,
        centre = centre, fwd = fwd, right = vector3(-fwd.y, fwd.x, 0.0), heading = heading,
        origin = GetEntityCoords(cache.ped), radar = not IsRadarHidden(),
        yaw = view.yaw, pitch = view.pitch, dist = view.dist, drop = view.drop,
        toYaw = view.yaw, toPitch = view.pitch, toDist = view.dist, toDrop = view.drop,
        settleUntil = 0,
    }
end

---What tells two phones apart in a store: the colour, whether it folds, and its design.
---@param color string frame colour
---@param fold boolean
---@param kind string? design; the classic one when left out
---@return string key
local function phoneKey(color, fold, kind)
    return ('%s+%s+%s'):format(color, fold and 'fold' or 'flat', kind or 'classic')
end

---Opens a store: asks the server what it sells and what this character has, stands the phone up
---and hands the page what it needs to draw the customizer.
---@param index integer position in config.Cases.Stores
function casestore.open(index)
    local shop = STORES[index]
    if not shop or scene or opening or closing then return end
    opening = true

    if exports[GetCurrentResourceName()]:isOpen() then exports[GetCurrentResourceName()]:close() end
    local res = lib.callback.await('sd-phone:server:cases:state', false)
    if type(res) ~= 'table' or res.success ~= true or type(res.data) ~= 'table' then
        opening = false
        notify.show(type(res) == 'table' and res.message or locale.t('cases.storeClosed', 'The case store is closed right now'), 'error')
        return
    end

    local data = res.data
    cases.set(data.equipped)
    local carried, frame, fold, kind = {}, pose.frame(), pose.hinged(), pose.look()
    for _, phone in ipairs(type(data.phones) == 'table' and data.phones or {}) do
        carried[phoneKey(phone.color, phone.fold == true, phone.look)] = true
    end
    if not carried[phoneKey(frame, fold, kind)] and data.phones and data.phones[1] then
        frame, fold, kind = data.phones[1].color, data.phones[1].fold == true, data.phones[1].look or 'classic'
    end
    blackout()
    for _, phone in ipairs(type(data.phones) == 'table' and data.phones or {}) do
        if phoneKey(phone.color, phone.fold == true, phone.look) == phoneKey(frame, fold, kind) then
            data.equipped = phone.case or false
            break
        end
    end
    local s = stage(shop, cases.clean(data.equipped), frame, fold, kind)
    if not s then
        opening = false
        DoScreenFadeIn(FADE_IN)
        notify.show(locale.t('cases.storeNoModels', 'The phones on show are missing. Is sd-phone-props running?'), 'error')
        return
    end

    s.clerk = clerks[index]
    s.carried = carried
    if s.clerk then SetEntityAlpha(s.clerk, 0, false) end
    scene = s
    FreezeEntityPosition(cache.ped, true)
    DisplayRadar(false)
    run(s)

    data.store = shop.name or locale.t('cases.storeName', 'Phone Cases')
    data.frame = s.frame
    data.blocked = s.blocked
    data.body = s.body
    data.look = s.kind
    data.phone = cases.styleOptions(s.kind)

    local started = GetGameTimer()
    while not DoesEntityHaveDrawable(s.phone) and GetGameTimer() - started < 1500 do Wait(0) end
    Wait(450)
    if scene ~= s then
        opening = false
        return
    end
    s.yaw, s.dist, s.settleUntil = s.toYaw - 34.0, s.toDist + 0.09, GetGameTimer() + SETTLE_MS
    opening = false
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(false)
    SendNUIMessage({ action = 'sd-phone:casestore:open', data = data })
    DoScreenFadeIn(FADE_IN)
end

---Whether a case store is open on this client.
---@return boolean
function casestore.isOpen()
    return scene ~= nil
end

---Dresses the phone on show in a design, or strips it.
---@param data table { design?: CaseDesign|false }
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:casestore:preview', function(data, cb)
    local s = scene
    if s then
        local design = cases.clean(type(data) == 'table' and data.design or nil)
        local signature = cases.signature(design)
        if cases.signature(s.design) ~= signature and s.wall then
            SendDuiMessage(s.wall, json.encode({ accent = accentOf(design) }))
        end
        s.design = design
        if not s.blocked and signature ~= s.wearing and DoesEntityExist(s.phone) then
            s.wearing = signature
            cases.dress(s.phone, s.body, design, cases.styleFor(s.kind), s.look)
        end
    end
    cb({ ok = true })
end)

---Shows another of the phones the player carries: the same case on a phone of another colour, or
---none where that phone comes in a case of its own.
---@param data table { color: string, fold: boolean, look: string } a phone the server listed
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:casestore:phone', function(data, cb)
    local s = scene
    local color = type(data) == 'table' and data.color or nil
    local fold = type(data) == 'table' and data.fold == true
    local kind = type(data) == 'table' and type(data.look) == 'string' and data.look or 'classic'
    if not s or type(color) ~= 'string' or not s.carried[phoneKey(color, fold, kind)] then
        cb({ success = false, messageKey = 'cases.phoneNotCarried', message = 'You do not have that phone on you' })
        return
    end
    local blocked = cases.blocked(color)
    local phone, body, look = pose.createLoose(s.centre, color, (not blocked) and s.design or nil, cases.styleFor(kind), fold)
    if not phone then
        cb({ success = false, messageKey = 'cases.storeNoModels', message = 'The phones on show are missing. Is sd-phone-props running?' })
        return
    end
    removePhone(s.phone)
    s.phone, s.body, s.look, s.frame, s.fold, s.kind, s.blocked = phone, body, look, color, fold, kind, blocked
    s.yaw, s.settleUntil = s.yaw - 40.0, GetGameTimer() + 900
    s.wearing = blocked and '' or cases.signature(s.design)
    cb({ success = true, data = { frame = color, blocked = blocked, body = body, look = kind, phone = cases.styleOptions(kind) } })
end)

---Changes the logo and trims this player likes on their phones, and swaps the phone on show for
---one that has them, dressed as the old one was. The design is not theirs to change here: it comes
---with the phone.
---@param data table { style?: PhoneStyle|false } false or nothing clears both
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:casestore:style', function(data, cb)
    cases.setStyle(type(data) == 'table' and data.style or nil)
    TriggerEvent('sd-phone:client:cases:changed')
    local s = scene
    if s then
        local phone, body, look = pose.createLoose(s.centre, s.frame, s.design, cases.styleFor(s.kind), s.fold)
        if phone then
            removePhone(s.phone)
            s.phone, s.body, s.look = phone, body, look
            s.yaw, s.settleUntil = s.yaw - 40.0, GetGameTimer() + 900
        end
    end
    cb({ success = true, data = cases.styleOptions(s and s.kind or nil) })
end)

---Switches the screen of the phone on show on or off. It starts off.
---@param data table { on: boolean }
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:casestore:screen', function(data, cb)
    if scene then
        if type(data) == 'table' and data.on == true then screensOn() else screensOff() end
    end
    cb({ ok = true })
end)

---Turns the phone on show by a mouse drag.
---@param data table { dx: number, dy: number } pixels moved
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:casestore:rotate', function(data, cb)
    local s = scene
    if s and type(data) == 'table' then
        s.toYaw = s.toYaw + (tonumber(data.dx) or 0.0) * 0.35
        s.toPitch = math.max(-PITCH_MAX, math.min(PITCH_MAX, s.toPitch + (tonumber(data.dy) or 0.0) * 0.25))
    end
    cb({ ok = true })
end)

---Moves the camera in or out by a turn of the wheel.
---@param data table { delta: number } negative comes closer
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:casestore:zoom', function(data, cb)
    local s = scene
    if s and type(data) == 'table' then
        s.toDist = math.max(DIST_MIN, math.min(DIST_MAX, s.toDist + (tonumber(data.delta) or 0.0) * 0.06))
    end
    cb({ ok = true })
end)

---Turns the phone to show the part being chosen.
---@param data table { view: string } a VIEWS name
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:casestore:view', function(data, cb)
    local s = scene
    local view = type(data) == 'table' and VIEWS[data.view] or nil
    if s and view then
        local turns = math.floor((s.toYaw + 180.0) / 360.0)
        s.toYaw, s.toPitch, s.toDist, s.toDrop = turns * 360.0 + view.yaw, view.pitch, view.dist, view.drop
    end
    cb({ ok = true })
end)

---Passes a store request to the server and hands its answer back to the page.
---@param action string the page's callback name, after 'sd-phone:casestore:'
---@param event string the server callback, after 'sd-phone:server:cases:'
local function forward(action, event)
    RegisterNUICallback('sd-phone:casestore:' .. action, function(data, cb)
        local res = lib.callback.await('sd-phone:server:cases:' .. event, false, data)
        cb(type(res) == 'table' and res or { success = false, message = 'No answer from the server' })
    end)
end


---Buys the design the page sends. The server is told which phone is on show, so a case bought to
---wear is fitted to that one.
---@param data table { design: CaseDesign, wear: boolean }
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:casestore:buy', function(data, cb)
    local s = scene
    if type(data) == 'table' and s then data.phone = { color = s.frame, fold = s.fold, look = s.kind } end
    local res = lib.callback.await('sd-phone:server:cases:buy', false, data)
    cb(type(res) == 'table' and res or { success = false, message = 'No answer from the server' })
end)

forward('collect', 'collect')
forward('equip', 'equip')
forward('remove', 'remove')

---Leaves the store at the player's request.
---@param _ table unused
---@param cb fun(res: table)
RegisterNUICallback('sd-phone:casestore:close', function(_, cb)
    close(false)
    cb({ ok = true })
end)

---Creates a store's clerk.
---@param index integer position in config.Cases.Stores
---@param shop table the store
local function spawnClerk(index, shop)
    local model = joaat(shop.ped)
    if not pcall(lib.requestModel, model, 5000) then return end
    local at = shop.coords
    local ped = CreatePed(4, model, at.x, at.y, at.z - 1.0, at.w or 0.0, false, true)
    SetModelAsNoLongerNeeded(model)
    SetEntityInvincible(ped, true)
    SetBlockingOfNonTemporaryEvents(ped, true)
    FreezeEntityPosition(ped, true)
    TaskStartScenarioInPlace(ped, 'WORLD_HUMAN_STAND_MOBILE', 0, true)
    clerks[index] = ped
    target.onReady(function()
        if clerks[index] ~= ped then return end
        target.addLocalEntity(ped, { {
            name     = 'sd-phone:casestore',
            icon     = 'fas fa-mobile-screen',
            label    = locale.t('cases.storeTarget', 'Customise Your Phone & Case'),
            distance = 2.5,
            onSelect = function() casestore.open(index) end,
        } })
    end)
end

---Removes a store's clerk.
---@param index integer position in config.Cases.Stores
local function removeClerk(index)
    local ped = clerks[index]
    if not ped then return end
    clerks[index] = nil
    if target.system then target.removeLocalEntity(ped, locale.t('cases.storeTarget', 'Customise Your Phone & Case')) end
    if DoesEntityExist(ped) then DeleteEntity(ped) end
end

---Puts a store on the map.
---@param shop table the store
local function addBlip(shop)
    local cfg = CFG.Blip
    if type(cfg) ~= 'table' or shop.blip == false then return end
    local blip = AddBlipForCoord(shop.coords.x, shop.coords.y, shop.coords.z)
    SetBlipSprite(blip, math.floor(tonumber(cfg.sprite) or 459))
    SetBlipColour(blip, math.floor(tonumber(cfg.colour) or 47))
    SetBlipScale(blip, tonumber(cfg.scale) or 0.7)
    SetBlipAsShortRange(blip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(cfg.label or 'Phone Cases')
    EndTextCommandSetBlipName(blip)
end

-- Each store: a blip, a clerk while the player is near, and a way in. With a target resource that
-- is an option on the clerk (or on the spot, for a store with no clerk); without one it is E.
for index, shop in ipairs(STORES) do
    if type(shop.coords) == 'vector4' or type(shop.coords) == 'vector3' then
        addBlip(shop)
        local at = vector3(shop.coords.x, shop.coords.y, shop.coords.z)
        local prompted = false

        local point = lib.points.new({ coords = at, distance = PED_RANGE })
        function point:onEnter()
            if shop.ped then spawnClerk(index, shop) end
        end
        function point:onExit()
            removeClerk(index)
        end
        function point:nearby()
            if target.system or scene then
                if prompted then prompted = false; lib.hideTextUI() end
                return
            end
            local near = self.currentDistance <= USE_RANGE
            if near ~= prompted then
                prompted = near
                if near then
                    lib.showTextUI(locale.t('cases.storePrompt', '[E] Customise your phone & case'))
                else
                    lib.hideTextUI()
                end
            end
            if near and IsControlJustReleased(0, 38) then
                lib.hideTextUI()
                prompted = false
                CreateThread(function() casestore.open(index) end)
            end
        end

        if not shop.ped then
            target.onReady(function()
                target.addSphereZone({
                    name = 'sd-phone:casestore:' .. index, coords = at, radius = 1.2,
                    options = { {
                        name     = 'sd-phone:casestore',
                        icon     = 'fas fa-mobile-screen',
                        label    = locale.t('cases.storeTarget', 'Customise Your Phone & Case'),
                        distance = 2.5,
                        onSelect = function() casestore.open(index) end,
                    } },
                })
            end)
        end
    end
end

---Public export: opens the case store the player is standing at, for a script that has its own
---way in (a menu, a job, an NPC of its own) - exports['sd-phone']:openCaseStore(). Nothing happens
---away from every store, because a case can only be bought at one.
---@return boolean opened false when no store is within reach
exports('openCaseStore', function()
    local here = GetEntityCoords(cache.ped)
    local reach = math.max(2.0, tonumber(CFG.Radius) or 8.0)
    for index, shop in ipairs(STORES) do
        if #(here - vector3(shop.coords.x, shop.coords.y, shop.coords.z)) <= reach then
            CreateThread(function() casestore.open(index) end)
            return true
        end
    end
    return false
end)

---Public export: closes the case store if this player has one open, the same way Escape does - for
---a script that takes the player's hands or attention away - exports['sd-phone']:closeCaseStore().
---@return boolean closed false when no store was open
exports('closeCaseStore', function()
    if not scene or closing then return false end
    close(true)
    return true
end)

-- A resource stop mid-browse must not leave the camera, the phone or the clerks behind.
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if scene and closing then
        teardown(scene)
        scene = nil
    end
    close(false, true)
    if IsScreenFadedOut() or IsScreenFadingOut() then DoScreenFadeIn(0) end
    for index in pairs(clerks) do removeClerk(index) end
end)

return casestore
