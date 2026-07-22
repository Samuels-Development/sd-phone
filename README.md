<div align="center">

# sd-phone (THIS IS A BETA RELEASE, WILL HAVE ISSUES)

**An iOS-themed smartphone for FiveM. 45+ server-backed apps, real app accounts, a live game-view camera, online multiplayer games, and drop-in lb-phone compatibility.**

The phone is **NOT ready yet for use on a live server**, this is for people to play around with it, report bugs and make PRs to speed up it's development, I'm hoping to have it done by the end of July.

[![Release](https://img.shields.io/github/v/release/Samuels-Development/sd-phone?label=Release&logo=github)](https://github.com/Samuels-Development/sd-phone)
[![Downloads](https://img.shields.io/github/downloads/Samuels-Development/sd-phone/total?label=Downloads&logo=github&color=94DD0C)](https://github.com/Samuels-Development/sd-phone)
[![Stars](https://img.shields.io/github/stars/Samuels-Development/sd-phone?label=Stars&logo=github)](https://github.com/Samuels-Development/sd-phone)
[![Discord](https://img.shields.io/discord/842045164951437383?label=Discord&logo=discord&logoColor=white)](https://discord.gg/FzPehMQaBQ)
[![Documentation](https://img.shields.io/badge/Docs-docs.samueldev.shop-94DD0C)](https://docs.samueldev.shop/resources/phone/)

![Framework](https://img.shields.io/badge/Framework-QBCore%20%7C%20QBox%20%7C%20ESX-3b82f6)
![Voice](https://img.shields.io/badge/Voice-pma--voice-3b82f6)
![Compatibility](https://img.shields.io/badge/lb--phone-drop--in%20compatible-3b82f6)

[**Documentation**](https://docs.samueldev.shop/resources/phone/) · [**Store**](https://fivem.samueldev.shop) · [**Discord**](https://discord.gg/FzPehMQaBQ)

</div>

---
Thanks for trying this so early. I'd put the phone at about 85% done as of writing, so expect rough edges and a few gaps. Some apps are still mock-only or not fully wired up yet (Vibez, for example, has no backend at this point and only a mock frontend), and there's a good amount of polish and fixes left across the board

Any issues or PRs are highly appreciated.

## Preview

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/352baf5c-fb7c-4791-9fcb-b76d1fc3168d" />

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/33291ecd-5264-464c-94ca-a78dd8f49330" />

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/93b8ede9-49ee-4704-9a05-741e0570b153" />

<img width="1920" height="1080" alt="FiveM_b3258_GTAProcess_xL4YbCQbY3" src="https://github.com/user-attachments/assets/a49a1c82-bd90-4088-aaa5-e1a6bc38c4a5" />

<img width="1920" height="1080" alt="FiveM_b3258_GTAProcess_3iEYIEm2CH" src="https://github.com/user-attachments/assets/0edad39f-94a2-41a6-a071-f74db2e4f8b5" />

<img width="1920" height="1080" alt="FiveM_b3258_GTAProcess_fmpiMFw6TQ" src="https://github.com/user-attachments/assets/425596fa-cc6e-4cf4-92ea-43d313aeb01b" />




## Overview

sd-phone is a complete smartphone experience: lockscreen with passcode and Face Unlock, customizable homescreen with a real app switcher, notification banners with persistent server-authoritative unread badges, and a full catalog of apps backed by their own server modules. The UI is a React app rendered inside a real iPhone bezel; the phone is held as an in-hand prop, tints to the colour of the phone item you used, and keeps working while you walk.

Everything player-facing is translatable, apps resume where you left them, and the phone auto-detects your framework, inventory, banking, housing, garage, and voice resources with zero config flags.

## Powered by Fivemanage

<div align="center">

<a href="https://refer.fivemanage.com/samuel"><img src="https://docs.samueldev.shop/fivemanage-banner.png" alt="Fivemanage" width="500" /></a>

### sd-phone is partnered with Fivemanage for media hosting

The Camera, Photos and Voice Memos apps need somewhere to store what they capture. sd-phone uses **[Fivemanage](https://refer.fivemanage.com/samuel)** for that: every screenshot, camera video and voice recording uploads to Fivemanage and comes back as a fast CDN URL, so you never run your own media server. It is the CDN and logging platform trusted by thousands of FiveM servers.

**A free Fivemanage Media API token is required for photo, video and voice-note uploads to work.** In the Fivemanage dashboard open the Tokens tab, create a token of type **Media**, and paste it into `configs/server/apikeys.lua` under `FivemanageMedia`. Without a key the camera and recorders still open, but nothing uploads or saves.

<a href="https://refer.fivemanage.com/samuel"><img src="https://img.shields.io/badge/Get%20started%20with%20Fivemanage-%E2%86%92-0D0D0D?style=for-the-badge" alt="Get started with Fivemanage" /></a>

<sub>The free tier is plenty for most servers.</sub>

</div>

## Apps

| | |
|---|---|
| **Communication** | Phone (1:1, group and company calls over pma-voice), Messages (SMS, group threads, GIFs, money and location cards), Mail (multi-account, global inboxes), Groups, Dark Chat, Radio, Find Friends |
| **Social** | Photogram (posts, stories, DMs, real live video streaming), Birdy, Cherry, Vibez, Streaks, all on a shared accounts engine with registration, sign-in, and password resets delivered in-game |
| **Camera & media** | Camera (live game view: photos, video with voice capture, selfie mode), Photos, Music (with AirShare library sharing), Voice Memos |
| **World** | Maps (CDN-streamed tiles, routing, pins), Garages, Homes, Wallet, Services (company directory, dispatch messaging, phone multijob), Ryde (player-to-player ride hailing), Weazel News, Pages, Marketplace, Review, Weather, Stocks |
| **Games** | Chess, Connect Four, Battleship and Wordle with online lobbies, plus Blackjack, Cookie, Flappy, Blocks, Climber and Rail Runner with server-side leaderboards |
| **Utilities** | Clock (alarms), Calendar, Notes (with sketches), Calculator, Compass, Health, Passwords, App Store, Settings |

## Highlights

- **Real accounts engine.** Social apps use actual registration and login, with verification codes and password resets delivered by in-game mail or SMS. Accounts are global, not per-character-slot.
- **Live game-view camera.** The Camera app renders the world into the phone screen in real time; video clips record your microphone and nearby players' voices.
- **Photogram Live.** Stream real encoded video to other players' phones, with clean late-joins.
- **Deep world integration.** Garages and Homes bridge across ten-plus garage and housing systems; Wallet reads your framework bank; Services maps jobs to callable, messageable companies; Weather mirrors the in-game sky.
- **Custom apps.** Other resources can put their own apps on the phone: one export call turns any webpage into an installable app with icons, badges, notifications, popups and an App Store listing. Custom apps built for lb-phone run unmodified. Start from the [app templates](https://github.com/Samuels-Development/sd-phone-app-templates) (plain JS, React JS/TS, Vue 3) and the [custom app guide](https://docs.samueldev.shop/resources/phone/custom-apps).
- **lb-phone drop-in compatibility.** Third-party scripts written against lb-phone's exports and events keep working unmodified, and a one-command migrator imports lb-phone player data. See the [compatibility docs](https://docs.samueldev.shop/resources/phone/lb-phone-compatibility).

## For developers

The phone ships a full integration surface, documented at [docs.samueldev.shop](https://docs.samueldev.shop/resources/phone/):

- [Server exports](https://docs.samueldev.shop/resources/phone/exports-server) for sending mail, messages and notifications, starting calls, managing contacts, resolving numbers to players, logging transactions, posting news, and more.
- [Client exports](https://docs.samueldev.shop/resources/phone/exports-client) for opening the phone, deep-linking into apps, and gating phone use.
- [Custom apps](https://docs.samueldev.shop/resources/phone/custom-apps) for shipping your own apps on the phone, with ready-made [templates](https://github.com/Samuels-Development/sd-phone-app-templates) for plain JS, React and Vue. Apps written for lb-phone register and run unmodified.
- [First-party events](https://docs.samueldev.shop/resources/phone/events-server) on every lifecycle moment: messages, mail, calls, transactions, posts, contacts.
- [lb-phone compatibility](https://docs.samueldev.shop/resources/phone/lb-phone-compatibility) covering exports, events, and `dependency 'lb-phone'` lines.

```lua
-- A taste: text a player from a job script
exports['sd-phone']:sendSystemMessage('555-0199', 'LS Dispatch', targetNumber, 'New tow request at Legion Square.')

-- React to any SMS being sent
AddEventHandler('sd-phone:server:messages:sent', function(m)
    print(('%s texted %s'):format(m.senderNumber, m.targetNumber))
end)
```

## Compatibility

| Layer | Supported |
|---|---|
| Frameworks | QBCore, QBox, ESX (auto-detected) |
| Inventories | ox_inventory, tgiann-inventory, qb-inventory, qs-inventory(-pro), origen_inventory, codem-inventory, jaksam_inventory, lj-inventory, ps-inventory |
| Voice | pma-voice |
| Housing | 9 housing systems for the Homes app |
| Garages | 10 garage systems for the Garages app |
| Notify | ox_lib (default), lation_ui (opt-in), framework-native fallback |

## Installation

Full guide: [docs.samueldev.shop/resources/phone/installation](https://docs.samueldev.shop/resources/phone/installation)

**Dependencies:** [ox_lib](https://github.com/CommunityOx/ox_lib) · [oxmysql](https://github.com/CommunityOx/oxmysql) · [sd-phone-props](https://github.com/Samuels-Development/sd-phone-props) (streams the in-hand phone models)

1. Drop `sd-phone` and [`sd-phone-props`](https://github.com/Samuels-Development/sd-phone-props) into your resources folder and ensure them after `ox_lib` and `oxmysql`. Database tables create themselves on first boot.
2. Add the phone items to your inventory, one per frame colour (`phone_black`, `phone_blue`, `phone_green`, `phone_orange`, `phone_pink`, `phone_purple`, `phone_red`, `phone_yellow`). Ready-made ox_inventory definitions and item icons are in the [installation docs](https://docs.samueldev.shop/resources/phone/installation); the icons ship in this repo's `images/` folder. Players can also open with the keybind (default F1), gated on owning a phone item.
3. Set your API keys in `configs/server/apikeys.lua`: a [Fivemanage](https://refer.fivemanage.com/samuel) token of type **Media** in `FivemanageMedia` (required for the Camera, Photos and Voice Memos apps to upload), and optionally a GIPHY key for the Messages GIF picker.

**Download the [latest release](https://github.com/Samuels-Development/sd-phone/releases)** (the packaged `sd-phone-*.zip`), not the green *Code -> Download ZIP*. The release zip carries the compiled UI and runs as-is; the source zip is code only and has no `web/build/`, so the phone opens blank.

Building from a git clone yourself: `cd web && npm ci && npm run build`. The output lands in the gitignored `web/build/`; the server logs a clear error on boot if it is missing.

## Unique Phones & SIM Cards (optional)

Off by default. Flip `Enabled = true` in `configs/uniquephones.lua` and phone numbers stop belonging to characters — they live on **SIM card items**. A second switch, `DeviceIdentity`, decides who owns the *data*:

- **`DeviceIdentity = true` (default) — the phone owns the data, the SIM only lends a number.** Each phone item gets a persistent identity the first time it's used, and that identity keys everything: messages, call log, contacts, photos, notes, app logins, settings, games. Popping the SIM out just drops your **number and service** — the phone still opens and every non-number app keeps working, the status bar reads **No Service**. Move a SIM to another phone and that phone gets your **number**, not your data. Steal a phone and you get *its* apps behind the owner's lockscreen (Face Unlock never works for you), but never their number unless the SIM is inside.
- **`DeviceIdentity = false` (legacy) — the SIM owns the data.** Whichever SIM is in a phone decides whose data that phone shows — everything. Steal someone's phone with the SIM inside and you're reading *their* phone; without any SIM, a phone opens to a full-screen **No SIM** screen with no service and every server action refused.

Either mode: the number follows the SIM, and Cloud Backup carries a character's data to a new phone (the number stays behind on the old SIM). Flipping an existing legacy server to the default device mode is safe and automatic — the first time each phone is used it **adopts** the identity of the SIM currently in it, so no data is copied or lost; only from then on does the number float free of the data.

**Don't want SIM cards at all?** Set `BuiltInNumbers = true` and phones stay unique devices but mint their own **permanent built-in number** on first use (an eSIM, stamped onto the item) — no `sim_card` item, no install/eject, the number lives and dies with the phone. Device identity is implied; skip the SIM item setup below entirely.

### Setup

1. Enable the feature in `configs/uniquephones.lua` and add the SIM item to your inventory (ox_inventory example; not needed with `BuiltInNumbers`):

   ```lua
   ['sim_card'] = {
       label = 'SIM Card',
       weight = 5,
       stack = false,
       close = true,
       consume = 0, -- required: sd-phone consumes the item itself on install
       server = { export = 'sd-phone.useSim_card' },
   },
   ```

2. Get SIMs to players — **no integration needed**: sell or spawn `sim_card` like any normal item (ox_inventory shop, loot table, `/give`, anything). A blank card **activates itself on first use**, minting and registering a fresh number on the spot; once activated the number stays on that card through every eject and reinsert. (`ActivateBlankSims = false` turns this off if you want SIM distribution controlled.)

   Optional paths for special cases:
   - `/givesim <playerId>` (admin) — a pre-activated SIM with a fresh number.
   - `/givesim <playerId> bind` — a **character-bound** SIM: it carries the player's existing number and their existing phone data, so servers switching the feature on lose nothing.
   - From another resource: `exports['sd-phone']:giveSimCard(source, { citizenid = cid })` for character-bound SIMs, or `{ number = '2085550123' }` to hardcode a specific number.
3. Phones handed out **before** enabling the feature keep working as items, but in container mode they have no SIM tray until re-issued.

### Two attach modes

| | `UseContainers = false` (default, universal) | `UseContainers = true` (ox_inventory only) |
|---|---|---|
| Install SIM | **Use the sim_card item** — it's consumed and written onto your phone | Right-click/use the phone → SIM tray opens → drag the SIM in |
| Eject SIM | Settings → **SIM & Backup** → *Eject SIM Card* (returns the item, number intact) | Drag the SIM out of the tray |
| Using the phone item | Opens the phone UI | Opens the SIM tray (ox intercepts container items); the phone UI opens via the keybind (default F1) |
| Backends | every supported backend below | ox_inventory |

Supported backends (via the slot-level bridge API in `bridge/server/inventory.lua`): **ox_inventory**, **qb-inventory**, **ps-inventory**, **lj-inventory**, **qs-inventory(-pro)**, **tgiann-inventory**, **codem-inventory**, **origen_inventory**, **jaksam_inventory**, plus a framework-native fallback for QBCore setups without a dedicated inventory. Plain ESX inventory has no item metadata and cannot support unique phones.

### Multiple phones & SIMs

A player can carry **several phones, each with its own SIM**. Whichever phone they open (use the item, or the keybind's last-used colour) is the **active** one — outgoing calls and messages act as that phone's number. All carried SIM'd phones stay **reachable**: a call or text to any of their numbers reaches the player, even while another phone is active. Settings → SIM & Backup lists the other phones on you.

### What players should know

- **No SIM = no service.** In the default device mode the phone still opens and non-number apps (photos, notes, settings, account apps, games) keep working — you just can't call or text and the bar shows **No Service** until a SIM is installed. In legacy mode a SIM-less phone is a dead **No SIM** screen.
- **Your number lives on the SIM.** Move the SIM to another phone and the number moves with it — and in legacy mode the whole phone profile follows too. **A lost number is lost** — restores never bring numbers back.
- **Passcodes still protect you.** A thief sees your lockscreen; if you set a passcode they must know it — Face Unlock never works for anyone but the phone's original owner.
- **Cloud Backup** (Settings → SIM & Backup) belongs to your **character** and is protected by a **backup password** you set when turning it on (a copy is saved into your Passwords app). After losing your phone, get a new phone + blank SIM, press *Restore from Backup* and enter the password: your contacts, messages, photos, notes, settings and app logins are copied to the new phone. The number is **not** restored — your new SIM keeps its own number, and the old number stays on the old SIM.

### SIM exports

```lua
-- Create + give a SIM card. opts.citizenid makes it character-bound (carries that
-- character's number/data); opts.number requests a specific number (nil if taken).
local number = exports['sd-phone']:giveSimCard(source, { citizenid = nil, number = nil })

exports['sd-phone']:getSimNumber(source)     -- bare-digit number in the player's ACTIVE phone, or nil
exports['sd-phone']:hasSim(source)           -- true when their active phone has a SIM
exports['sd-phone']:isSimModeActive()        -- true while unique phones are enabled + supported
exports['sd-phone']:isNumberAvailable(number) -- true when a number is free to assign

-- Assign a specific number to the SIM in the player's ACTIVE phone (identity/data kept).
-- This is the hook for your own "buy a custom number" implementation.
local ok, err = exports['sd-phone']:setSimNumber(source, '5550001234')
-- err on failure: 'invalid' | 'no_sim' | 'taken'
```

Existing number exports (`getPhoneNumber`, `getSourceByNumber`, `getIdentifierByNumber`, `isNumberInService`, `hasPhone`) automatically follow the SIM when the feature is on.

---

## Payphones (optional)

Street payphones let players call any number from the phone boxes around the map - no phone item needed. Walk up to a booth, target **Use Payphone**, punch the number in on the keypad and hit call. The booth plays the scripted payphone animation while you talk.

### Setup

Everything lives in `configs/payphone.lua`:

- `Enabled` - master switch; `false` removes the targets and disables every payphone callback.
- `Models` - the phone-box props that get the target interaction (works with ox_target, qb-target and qtarget through the built-in bridge).
- `UseOxLibMenu` - swap the payphone UI page for ox_lib context menus and an input dialog.
- `Anonymous` - when `true`, the person you call sees a withheld caller instead of the booth's number.
- `CallerLabel` - the name shown on the callee's incoming-call screen (their saved contacts still take priority).
- `ShowFavorites` - shows the player's favourite contacts (and their own number) on the booth's notepad for quick dialing.
- `NumberPrefix` - the area code minted payphone numbers start with.
- `Scene` - the on-the-phone animation clips; disable or reclip per game build.
- `Inbound` - calling a booth's number back rings the physical booth; anyone nearby can pick up via **Answer Phone**. Configure the ring timeout and bell sound here.

### Static numbers

Each booth mints a persistent number the first time it's used (stored in `phone_payphones`). The same street corner always calls out from the same number, so players can save it, recognise it - and call it back.

### Payphone exports

```lua
-- Opens the payphone dial UI at the player's position, for any script (client-side):
exports['sd-phone']:openPayphone()

-- True while the payphone UI is on screen (client-side):
exports['sd-phone']:isPayphoneOpen()
```

<div align="center">

**[Documentation](https://docs.samueldev.shop/resources/phone/)** · **[Store](https://fivem.samueldev.shop)** · **[Discord](https://discord.gg/FzPehMQaBQ)**

</div>

