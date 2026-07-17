<div align="center">

# sd-phone (THIS IS A BETA RELEASE, WILL HAVE ISSUES)

**An iOS-themed smartphone for FiveM. 45+ server-backed apps, real app accounts, a live game-view camera, online multiplayer games, and drop-in lb-phone compatibility.**

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
- **lb-phone drop-in compatibility.** Third-party scripts written against lb-phone's exports and events keep working unmodified, and a one-command migrator imports lb-phone player data. See the [compatibility docs](https://docs.samueldev.shop/resources/phone/lb-phone-compatibility).

## For developers

The phone ships a full integration surface, documented at [docs.samueldev.shop](https://docs.samueldev.shop/resources/phone/):

- [Server exports](https://docs.samueldev.shop/resources/phone/exports-server) for sending mail, messages and notifications, starting calls, managing contacts, resolving numbers to players, logging transactions, posting news, and more.
- [Client exports](https://docs.samueldev.shop/resources/phone/exports-client) for opening the phone, deep-linking into apps, and gating phone use.
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
2. Add the phone items to your inventory, one per frame colour (`phone`, `phone_blue`, `phone_green`, `phone_orange`, `phone_pink`, `phone_purple`, `phone_red`, `phone_yellow`). Ready-made ox_inventory definitions and item icons are in the [installation docs](https://docs.samueldev.shop/resources/phone/installation); the icons ship in this repo's `images/` folder. Players can also open with the keybind (default F1), gated on owning a phone item.
3. Optionally set your API keys in `configs/server/apikeys.lua` (GIPHY for the GIF picker, Fivemanage for media uploads).

The pre-built UI ships at `web/build/`, so a fresh clone runs without touching npm. To rebuild after UI changes: `cd web && npm install && npm run build`.

---

<div align="center">

**[Documentation](https://docs.samueldev.shop/resources/phone/)** · **[Store](https://fivem.samueldev.shop)** · **[Discord](https://discord.gg/FzPehMQaBQ)**

</div>
