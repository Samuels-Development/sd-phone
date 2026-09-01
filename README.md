<div align="center">

# sd-phone

### Try it right now, in your browser

[![Open the live demo](https://img.shields.io/badge/%E2%96%B6%20%20OPEN%20THE%20LIVE%20DEMO-fivem.samueldev.shop%2Fphone-F0E155?style=for-the-badge&labelColor=101114&logoColor=F0E155)](https://fivem.samueldev.shop/phone)

**The real phone and tablet running on sample data. No download, no server, nothing to install.**
Unlock it, rearrange the home screen, install apps from the App Store, open the police terminal, take it fullscreen.

<sub>[fivem.samueldev.shop/phone](https://fivem.samueldev.shop/phone)</sub>

---

**An iOS-themed smartphone for FiveM.** that supports QBOX, QBCORE, ESX, ox_core and ND. 49 server-backed apps, real app accounts, a live game-view camera and online multiplayer games. Ships its own custom phone props: eight phone items in eight colours, each tinting both the on-screen frame and the custom prop model held in hand. A unique phone system as well as sim cards can be enabled!

**A drop-in replacement for lb-phone, qs-smartphone, gksphone, roadphone and YSeries.** Scripts and custom apps written against any of them keep running unmodified: their exports answer and their events fire, so nothing has to be rewritten. And if you are coming from lb-phone or YSeries, a migration carries your players across rather than resetting them: their numbers, contacts, messages, mail, photos, wallet history and social accounts, right down to the app logins, so they open the phone already signed in. Unique phones included - every phone item keeps the number and the data it had, without anyone's inventory being rewritten.

If sd-phone is useful to you, please ⭐ the repo. Issues and pull requests are always welcome.

[![Release](https://img.shields.io/github/v/release/Samuels-Development/sd-phone?label=Release&logo=github)](https://github.com/Samuels-Development/sd-phone)
[![Downloads](https://img.shields.io/github/downloads/Samuels-Development/sd-phone/total?label=Downloads&logo=github)](https://github.com/Samuels-Development/sd-phone/releases)
[![Stars](https://img.shields.io/github/stars/Samuels-Development/sd-phone?label=Stars&logo=github)](https://github.com/Samuels-Development/sd-phone)
[![Discord](https://img.shields.io/discord/842045164951437383?label=Discord&logo=discord&logoColor=white)](https://discord.gg/FzPehMQaBQ)
[![Documentation](https://img.shields.io/badge/Docs-docs.samueldev.shop-94DD0C)](https://docs.samueldev.shop/resources/phone/)

![Framework](https://img.shields.io/badge/Framework-QBCore%20%7C%20QBox%20%7C%20ESX%20%7C%20ox__core%20(beta)%20%7C%20ND%20(beta)-3b82f6)
![Voice](https://img.shields.io/badge/Voice-pma--voice-3b82f6)
![Compatibility](https://img.shields.io/badge/Drop--in%20compatible-lb--phone%2C%20qs%2C%20gks%2C%20road%2C%20YSeries-3b82f6)

[**Live demo**](https://fivem.samueldev.shop/phone) · [**Documentation**](https://docs.samueldev.shop/resources/phone/) · [**Store**](https://fivem.samueldev.shop) · [**Discord**](https://discord.gg/FzPehMQaBQ)

</div>

---

> [!IMPORTANT]
> **This is production ready.** sd-phone is ready to run on a live server — there should be
> no blatant issues with the phone as it stands today.
>
> The version number is not a warning about stability. It sits below 1.0.0 because 1.0.0 is
> a scope target rather than a quality one: there is more I want in the initial 1.0.0 release
> than what is here today. That is the only thing holding the number back.

> [!IMPORTANT]
> **Coming from lb-phone or YSeries? Run the import when you are ready for it.**
> Nothing is imported automatically. Open **`/phoneadmin` → Migration**: it previews what your old database actually holds, lets you pick what to bring across, and streams the run with a live log and an ETA.
>
> What comes across: phone numbers and lock passcodes, contacts, blocked numbers, call history, messages, mail, notes, photos and albums, voice memos, wallet history, classifieds, phone settings, and whichever social apps your old phone had (Birdy, Photogram, Cherry, Dark Chat, Weazel News, Clout) with their posts, DMs, followers and logins, so players open the phone already signed in.
>
> **Unique phones come across as unique phones.** If lb-phone kept a number on each phone item, every one of those phones keeps its own number and its own data here: a player carrying two opens two separate phones, and handing one to somebody hands over what is on it. Nobody's inventory is edited to do it - sd-phone reads the number lb-phone already wrote onto the item and tidies it away the next time that phone's SIM is written, so phones sitting in a trunk, a stash or an offline player's pockets are fine and need no migration of their own. Turn unique phones on in `configs/uniqueandsim.lua` **before** you import. With `DataOwner = 'character'`, with SIM trays, or on an inventory that cannot store per-item metadata there is nowhere per-phone to put the data, so the import keys it per player instead and says which of those it was in the log.
>
> **Already imported once, before unique phones were on?** Run it again. Phones whose numbers are already set up here are left exactly as they are - nothing is rewritten and nothing is duplicated - and only the ones the first run had to skip, a player's second and third phones, are brought across. The run reports how many that is before it starts.
>
> On a large database this is not instant. A production import of **3.8 million rows took roughly 8 minutes**, and the server stays busy until it finishes. Start it when that is acceptable, and let it run to the end.
>
> The import is idempotent and non-destructive: a marker table stops a domain running twice, every write is fill-only, and a player who already has sd-phone data is never overwritten. So it is safe to re-run, and safe to do in stages.
>
> Prefer it to happen by itself? Set `enabled = true` in `configs/migrate.lua` and it runs on the next boot instead. From the server console, `sdphone:migrate` starts a run, `sdphone:migrate dry` previews without writing, and adding `yseries` or `lbphone` picks the source (it otherwise detects whichever your database carries).

> [!TIP]
> **Want a tablet? Check out the companion tablet, [sd-tablet](https://github.com/Samuels-Development/sd-tablet).**
> A second device for the same character, running these same apps on a bigger screen. Same messages,
> same contacts, same accounts, same wallet, because there is one set of player data and both devices
> read it. No pairing, no sync, no second phone to configure.
>
> It is a companion resource and needs sd-phone to run. [More below](#companion-sd-tablet).

## Preview

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/c1300d66-6530-47d4-ad02-676646b96fc7" />

<img width="1920" height="1280" alt="image" src="https://github.com/user-attachments/assets/f39c874c-f52d-430b-94af-41a45ada560a" />

<img width="1920" height="1280" alt="image" src="https://github.com/user-attachments/assets/6f4998d2-5c7b-4a50-9af8-5b28053d2709" />

<img width="1920" height="1080" alt="bb6" src="https://github.com/user-attachments/assets/9234cba8-6293-4a9b-8f5a-372eb97c88af" />

<img width="1920" height="1080" alt="THIS" src="https://github.com/user-attachments/assets/7c9ee63d-a5d6-42ee-8664-a62e06838741" />

<img width="1920" height="1080" alt="mb3" src="https://github.com/user-attachments/assets/896f0a95-2077-405f-b494-17ffbc13684e" />

## Powered by Fivemanage

<div align="center">

<a href="https://refer.fivemanage.com/samuel"><img src="https://docs.samueldev.shop/fivemanage-banner.png" alt="Fivemanage" width="500" /></a>

### sd-phone is partnered with Fivemanage for media hosting

The Camera, Photos and Voice Memos apps need somewhere to store what they capture. sd-phone uses **[Fivemanage](https://refer.fivemanage.com/samuel)** for that: every screenshot, camera video and voice recording uploads to Fivemanage and comes back as a fast CDN URL, so you never run your own media server. It is the CDN and logging platform trusted by thousands of FiveM servers.

**A free Fivemanage Media API token is required for photo, video and voice-note uploads to work.** In the Fivemanage dashboard open the Tokens tab, create a token of type **Media**, and paste it into `configs/server/apikeys.lua` under `FivemanageMedia`. Without a key the camera and recorders still open, but nothing uploads or saves.

Already on a [Qbox Dashboard](https://dashboard.qbox.re) plan? You can point uploads at the Qbox CDN instead: set `Provider = 'qbox'` in `configs/photos.lua` and put your token in `QboxCdn`. See the [installation docs](https://docs.samueldev.shop/resources/phone/installation#choosing-a-media-provider) for the details.

<a href="https://refer.fivemanage.com/samuel"><img src="https://img.shields.io/badge/Get%20started%20with%20Fivemanage-%E2%86%92-0D0D0D?style=for-the-badge" alt="Get started with Fivemanage" /></a>

<sub>The free tier is plenty for most servers.</sub>

</div>

## Apps

| | |
|---|---|
| **Communication** | Phone (1:1, group and company calls over pma-voice), Messages (SMS, group threads, GIFs, money and location cards), Mail (multi-account, global inboxes), Groups, Dark Chat, Radio, Find Friends |
| **Social** | Photogram (posts, stories, DMs, real live video streaming), Birdy, Cherry, Clout (short-form video), Streaks, all on a shared accounts engine with registration, sign-in, and password resets delivered in-game |
| **Camera & media** | Camera (live game view: photos, video with voice capture, selfie mode), Photos, Music (with AirShare library sharing), Voice Memos |
| **World** | Maps (CDN-streamed tiles, routing, pins), Garages, Homes, Bank, Services (company directory, dispatch messaging, phone multijob), Ryde (player-to-player ride hailing), Racing (race board with an in-game track creator, unlocked by a `racing_usb` item), Weazel News, Pages, Marketplace, Weather, Stocks |
| **Games** | Casino (Slots, Roulette, Blackjack, Baccarat, Crash and Texas Hold'em on a shared chip balance), Chess, Connect Four, Battleship and Wordle with online lobbies, plus Cookie, Flappy, Blocks and Climber with server-side leaderboards |
| **Job terminals** | MDT, EMS and DOJ, job-gated, with records, warrants, reports, a firearms registry, live CCTV, and bodycam and dashcam review. Off by default: set `Enabled = true` in `configs/mdt.lua`. Best on the bigger screen of [sd-tablet](https://github.com/Samuels-Development/sd-tablet) |
| **Utilities** | Clock (alarms), Calendar, Notes (with sketches), Files (documents with multi-signer signing, sendable as mail attachments), Calculator, Compass, Health (daily stats and a server-wide steps leaderboard), Passwords, ID (identity cards from your character record and licences, showable to a nearby phone), App Store, Settings |

## Home screen widgets

Eleven widgets, each in three sizes (2x2, 4x2 and 4x4), added from the Add Widget sheet in edit mode and placed anywhere on any page.

| Widget | Shows |
|---|---|
| **Weather** | Current conditions coloured by the in-game sky, hourly strip, and a five-day forecast with temperature range bars |
| **Clock** | Analogue face with a sweep hand and date |
| **Clock (Digital)** | Large type, city, seconds and full date |
| **Now Playing** | Artwork, track and transport controls that work without opening Music |
| **Wallet** | Balance, cash on hand and recent transactions |
| **Stocks** | Your holdings first by position value, with profit or loss, sparklines and a portfolio total |
| **Contacts** | Hand-picked people you tap to call, chosen with the standard contact picker |
| **Garage** | Your vehicles with photos, plates and stored / out / impounded status |
| **Activity** | Steps, distance and heart rate as concentric rings |
| **Weazel News** | The lead story with its photo, plus the breaking ticker |
| **Timers & Alarms** | A live countdown ring, or the next alarm and everything else you have set |

Nine of them offer a **Dark, Light or Glass** finish; Glass frosts your wallpaper behind the tile. Weather and Now Playing take their colour from their content instead. Clock and Weather also align left, centre or right. Previews in the picker render over your own wallpaper at true size, so what you see is what gets placed.

## Companion: sd-tablet

<div align="center">

### [sd-tablet](https://github.com/Samuels-Development/sd-tablet) is a tablet for the same character

[![sd-tablet](https://img.shields.io/badge/sd--tablet-companion%20resource-94DD0C?style=for-the-badge)](https://github.com/Samuels-Development/sd-tablet)

</div>

A second device your players can carry, running **this** phone's apps on a bigger screen. It is a
companion resource, not a separate phone: it ships no apps, no database tables and no server logic
of its own, and it renders sd-phone's own `web/src` against a tablet device profile, so there is
exactly one copy of the interface and it cannot drift.

Everything is shared because nothing is copied. One set of player data on this server, two devices
reading it: the same Messages threads, contacts, mail, notes, photos, app logins, wallet, settings
and passcode. There is no pairing step and no sync, because there is nothing to sync.

The tablet cannot **place or answer voice calls**. That refusal is enforced here, in
`client/companion.lua`, on sd-phone's side of the seam, so it holds even for a modified tablet
build. Home screen arrangement is the one thing the two devices keep separately, since a layout's
page boundaries are that device's own grid.

Requires sd-phone, and only works alongside it. Install it next to this resource and `ensure` it
after: [github.com/Samuels-Development/sd-tablet](https://github.com/Samuels-Development/sd-tablet)

## Highlights

- **Real accounts engine.** Social apps use actual registration and login, with verification codes and password resets delivered by in-game mail or SMS. Accounts are global, not per-character-slot.
- **Live game-view camera.** The Camera app renders the world into the phone screen in real time; video clips record your microphone and nearby players' voices.
- **Photogram Live.** Stream real encoded video to other players' phones, with clean late-joins.
- **Deep world integration.** Garages and Homes bridge across 13 garage systems and 12 housing systems; Wallet reads your framework bank; Services maps jobs to callable, messageable companies; Weather mirrors the in-game sky.
- **Custom apps.** Other resources can put their own apps on the phone: one export call turns any webpage into an installable app with icons, badges, notifications, popups and an App Store listing. Custom apps built for lb-phone run unmodified. Start from the [app templates](https://github.com/Samuels-Development/sd-phone-app-templates) (plain JS, React JS/TS, Vue 3, Svelte 5) and the [custom app guide](https://docs.samueldev.shop/resources/phone/custom-apps).
- **Drop-in compatibility.** Scripts written for lb-phone, qs-smartphone (including PRO and Lite), gksphone, roadphone or YSeries keep working unmodified: every documented export is answered and their events are mirrored. Anything sd-phone has no equivalent for warns once with the reason instead of failing silently. Player data from lb-phone and YSeries imports from `/phoneadmin` → Migration. See the [compatibility docs](https://docs.samueldev.shop/resources/phone/lb-phone-compatibility).

## For developers

The phone ships a full integration surface, documented at [docs.samueldev.shop](https://docs.samueldev.shop/resources/phone/):

- [Server exports](https://docs.samueldev.shop/resources/phone/exports-server) for sending mail, messages and notifications, starting calls, managing contacts, resolving numbers to players, logging transactions, posting news, and more.
- [Client exports](https://docs.samueldev.shop/resources/phone/exports-client) for opening the phone, deep-linking into apps, and gating phone use.
- [Custom apps](https://docs.samueldev.shop/resources/phone/custom-apps) for shipping your own apps on the phone, with ready-made [templates](https://github.com/Samuels-Development/sd-phone-app-templates) for plain JS, React, Vue and Svelte. Apps written for lb-phone register and run unmodified.
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
| Frameworks | QBCore, QBox, ESX, ox_core, ND (auto-detected) |
| Inventories | ox_inventory, one_inventory, tgiann-inventory, qb-inventory, qs-inventory(-pro), origen_inventory, codem-inventory, jaksam_inventory, lj-inventory, ps-inventory |
| Voice | pma-voice |
| Housing | 12 housing systems for the Homes app |
| Garages | 13 garage systems for the Garages app, plus ND_Core as the fallback on ND |
| Notify | ox_lib (default), lation_ui (opt-in), framework-native fallback |

## Installation

> [!IMPORTANT]
> Grab the packaged **`sd-phone-*.zip`** from the [latest release](https://github.com/Samuels-Development/sd-phone/releases).
> The green **Code → Download ZIP** button gives you source only, with no `web/build/`, and the phone will open blank.

Prefer the full walkthrough? [docs.samueldev.shop/resources/phone/installation](https://docs.samueldev.shop/resources/phone/installation)

### Dependencies

| Resource | What it is for |
| --- | --- |
| [ox_lib](https://github.com/CommunityOx/ox_lib) | Shared library. **v3.39.0 or newer recommended** |
| [oxmysql](https://github.com/CommunityOx/oxmysql) | Database access |
| [sd-phone-props](https://github.com/Samuels-Development/sd-phone-props) | Streams the in-hand phone models |

### 1. Start the resources

Extract `sd-phone` and `sd-phone-props` into your resources folder, then start them after their dependencies:

```cfg
ensure ox_lib
ensure oxmysql
ensure sd-phone-props
ensure sd-phone
```

Database tables create themselves on first boot.

### 2. Add the phone items

One item per frame colour:

```
phone_black   phone_blue     phone_green   phone_orange
phone_pink    phone_purple   phone_red     phone_yellow
```

Ready-made ox_inventory definitions live in the [installation docs](https://docs.samueldev.shop/resources/phone/installation), and the item icons ship in this repo's `images/` folder.

**On ESX with no separate inventory resource, this step is automatic.** ESX keeps its item catalogue in the `items` database table, and an item missing from it can never be given or used, so the phone would register correctly and still refuse to open. sd-phone adds the missing rows on boot and refreshes ESX's catalogue in place, no restart needed. Turn it off with `SeedEsxItems = false` in `configs/phone.lua` and import `sql/esx_items.sql` yourself instead. Servers running ox_inventory, qs, tgiann or codem are untouched: define the items in that inventory as usual.

Players can also open the phone with a keybind (<kbd>F1</kbd> by default), which still requires owning one of these items.

The Racing app is unlocked separately by a `racing_usb` item, consumed on use. Drop the `requires` line from its row in `configs/apps.lua` to hand it to everyone instead.

Running unique phones with physical SIM trays (`SimTray` in `configs/uniqueandsim.lua`, ox_inventory only)? Give every phone item a `buttons` entry so players can open its tray:

```lua
buttons = {
    { label = 'SIM Tray', action = function(slot) exports['sd-phone']:openSimTray(slot) end },
},
```

Using the phone item opens the phone itself, so the tray needs its own button. Skip this in metadata mode, where SIMs are installed by using the `sim_card` item.

### 3. Add your API keys

In `configs/server/apikeys.lua`:

| Key | Needed for |
| --- | --- |
| `FivemanageMedia` | **Required** on the default provider. Camera, Photos and Voice Memos uploads. Create a free [Fivemanage](https://refer.fivemanage.com/samuel) token of type **Media**. Without it those apps open, but nothing uploads or saves. |
| `QboxCdn` | Optional. Used only when `Provider = 'qbox'` in `configs/photos.lua`. A CDN token from the [Qbox Dashboard](https://dashboard.qbox.re) (free tier includes 2 GB). |
| `Giphy` | Optional. The GIF picker in Messages. Free key from [developers.giphy.com](https://developers.giphy.com). |

### 4. Video calls between networks (TURN)

Video calls send the picture peer-to-peer over WebRTC, with the audio staying on your voice
resource. A public STUN server is built in, which is enough when both players share a network.
Two players on **different home connections need a TURN relay** to get a picture at all.

Without one the symptom is easy to misread as a bug: the call connects, the timer runs, the audio
works and your own self-view looks perfect, but the other person's side of the screen stays black.
Nothing has crashed, the video simply has no route.

**One setup covers everything**: video calls, nearby-voice capture in camera clips, Photogram Live
and bodycams all share the same relay. The quickest route is Cloudflare's free TURN service, which
sd-phone provisions for you. Create a TURN key at **Cloudflare dashboard, Realtime, TURN**, then put
the two values in your `server.cfg`:

```cfg
set sd_cf_turn_token_id  "your-cloudflare-turn-token-id"
set sd_cf_turn_api_token "your-cloudflare-turn-api-token"
```

These are convars rather than config entries so credentials never land in the repo. sd-phone mints
short-lived credentials from them and refreshes automatically, so nothing expires on you.

Prefer your own relay? A fixed TURN server works too, and can be used alongside the above:

```cfg
set sd_phone_turn_url        "turn:turn.example.com:3478"
set sd_phone_turn_username   "your-username"
set sd_phone_turn_credential "your-password"
```

Use this form for self-hosted [coturn](https://github.com/coturn/coturn) or a static-credential
provider such as Metered. Note that Cloudflare and Twilio issue **expiring** credentials through an
API, so their values cannot be pasted here; use the convar pair above for Cloudflare instead.

sd-phone prints one reminder line at boot while no relay is configured; silence it with
`WarnAboutTurn = false` in `configs/phone.lua`.

### Building from source

Cloned the repo instead of using a release? Build the UI yourself:

```bash
cd web
npm ci
npm run build
```

The output lands in the gitignored `web/build/`, and the server logs a clear error on boot if it is missing.

