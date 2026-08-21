# Cell Towers - test plan

Manual in-game verification for the cell tower system. The maths, the store and the status bar
icon are already covered by automated tests (see [What is already automated](#what-is-already-automated)
at the end); everything here is the part machines cannot check.

Work top to bottom the first time. Sections C onward assume the system is switched on.

---

## Before you start

1. `configs/celltowers.lua` → `Enabled = true`
2. `configs/celltowers.lua` → `Blips.Enabled = true` (turn it back off when you are done)
3. Restart the resource: `ensure sd-phone`
4. Have a second player available for sections F, G and H. Those cannot be tested solo.

**Teleporting:** the Z you land at does not matter. Distance is measured horizontally, so a
teleport that drops you at the wrong height still gives an honest reading. That is itself worth
knowing while testing: if a result looks wrong, altitude is not the reason.

### The test line

One straight drive due east from the Sandy Shores mast passes through every band. Nothing else
overlaps out there, so each reading is that one tower alone.

| Point | X | Y | Level | Bars | Text | Call | Data |
|---|---|---|---|---|---|---|---|
| **A** at the mast | 1858.3 | 3694.0 | 1.00 | 4 | yes | yes | yes |
| **B** strong | 2504.3 | 3694.0 | 0.62 | 3 | yes | yes | yes |
| **C** mid | 2878.3 | 3694.0 | 0.40 | 2 | yes | yes | yes |
| **D** data drops | 3082.3 | 3694.0 | 0.28 | 2 | yes | yes | **no** |
| **E** calls still up | 3218.3 | 3694.0 | 0.20 | 1 | yes | yes | no |
| **F** texts only | 3388.3 | 3694.0 | 0.10 | 1 | yes | **no** | no |
| **G** dead | 3898.3 | 3694.0 | 0.00 | 0 | **no** | no | no |

Do not test exactly on a threshold boundary. The cutoffs are floating point, so a point sitting
precisely on 0.75 can land either side of it. Every coordinate above sits comfortably inside its
band on purpose.

### Test commands

The `sd-phonetest` resource carries a `/celltest` harness that reaches the exports the way a
third-party script would. Every preset is admin-only (`group.admin`) and works from chat or the
server console; from the console a server id is required, in game the target defaults to you.

**Every command:**

| Command | Side exercised | What it prints |
|---|---|---|
| `/celltest` | - | same as `help` |
| `/celltest help` | - | the preset list |
| `/celltest server` | server | position, `getServiceLevel`, `hasService` for default/text/call/data |
| `/celltest server 4` | server | the same, for player 4 |
| `/celltest client` | client | position, `getServiceLevel`, `getServiceBars`, all four `hasService` forms, `getCellTowers` with the distance to each mast |
| `/celltest client 4` | client | the same, for player 4 |
| `/celltest compare` | both | client level, server level, the difference, and a pass or fail on whether they agree |
| `/celltest compare 4` | both | the same, for player 4 |
| `/celltest towers` | server | `getCellTowers`, sd-phone shape, ranges kept |
| `/celltest lb` | server | `GetCellTowers` through the lb-phone shim, bare `vector3` |
| `/celltest lbserver` | server | alias for `lb` |
| `/celltest lbclient` | client | `GetCellTowers` through the lb-phone shim, on your client |
| `/celltest lbclient 4` | client | the same, for player 4 |
| `/celltest bars 2` | client | forces your bar count to 2 via `SetServiceBars` |
| `/celltest bars 2 4` | client | forces player 4 to 2 bars |
| `/celltest bars 0` | client | forces zero bars, which shows as "No Service" |
| `/celltest bars clear` | client | drops the override, back to the real reading |

Notes worth having in mind:

- **`compare` is the one to run at every waypoint.** The client draws the bars but the server
  decides what is allowed, so the two agreeing is the entire trust model. It flags any gap wider
  than 0.02, which would mean client and server disagree about where you are standing.
- **`bars` takes its value first**, so `/celltest bars 2` targets you and `/celltest bars 2 4`
  targets player 4. The override is cosmetic: calls and texts keep following the real position,
  and checking that is the point of the preset.
- **The client presets need a round trip.** If one reports no reply within three seconds, the
  harness says so and tells you to restart `sd-phonetest`, which means its client script is newer
  than the last resource start.

---

## Bars to capabilities

What each bar count permits, with the shipped `Bars` cutoffs and `Thresholds`:

| Bars | Level | Text | Call | Data apps |
|---|---|---|---|---|
| **4** | 0.75 - 1.00 | yes | yes | yes |
| **3** | 0.50 - 0.75 | yes | yes | yes |
| **2** | 0.25 - 0.50 | yes | yes | **depends** |
| **1** | 0.05 - 0.25 | yes | **depends** | no |
| **0** | below 0.05 | no | no | no |

One bar is not the same as none. At one bar you can still text and the icon draws a single solid
bar; at zero the icon is replaced by the "No Service" label.

**Restricted** means, concretely:

- **Data blocked** - Photogram, Birdy, Mail, Marketplace, Banking, Stocks, Services, Garages,
  Homes, Ryde, Weazel News, Darkchat, Groups, Friends, Cherry, Vibez, Pages, Review, Streaks,
  GIFs and the games all refuse with "No Service"
- **Call blocked** - you cannot dial and nobody can reach you
- **Text blocked** - you cannot send; texts to you are held and replay when you return
- **Never restricted, at any level including zero** - Settings, Notes, Files, Photos, Contacts,
  Messages (reading), Phone (reading the call log), Voice Memos, Music, Clock, Radio, Cookie,
  AirShare, payphones, and hanging up or declining a call

### Known wart: two bands are ambiguous

The capability thresholds do not line up with the bar cutoffs, so they fall in the *middle* of two
bands rather than on their edges:

- at **2 bars**, data works above 0.30 and is blocked below it
- at **1 bar**, calls work above 0.15 and are blocked below it

A player looking at two bars cannot tell whether Photogram will load. Moving the bar cutoffs onto
the thresholds fixes it in one line, without changing what works where, since the thresholds
themselves stay put:

```lua
Bars = { 0.05, 0.15, 0.30, 0.60 },   -- instead of { 0.05, 0.25, 0.50, 0.75 }
```

That yields one meaning per bar count: 4 and 3 everything, 2 text and call, 1 text only, 0
nothing. Vespucci Beach, Grapeseed and Chiliad's summit would then read 3 bars rather than 2,
which is the truth: they have full data today while displaying a fringe signal.

**Not applied.** The table above documents what currently ships.

---

## A. Ships inert

Proves an existing server updating sd-phone sees no change until it opts in.

- [ ] Set `Enabled = false`, restart, stand at **G** (a dead zone when the system is on)
- [ ] Status bar shows the full static bars, not "No Service"
- [ ] Place a call, send a text, open Photogram: all work normally
- [ ] `exports['sd-phone']:getServiceLevel()` returns `1.0`
- [ ] Set `Enabled = true` again and restart before continuing

Also worth one pass: set `Enabled = true` but empty the `Towers` list. Behaviour must be identical
to the above. A server with the switch on and no masts configured must not lose its phones.

---

## B. Map blips

- [ ] With `Blips.Enabled = true`, open the pause map: eight markers, each inside a translucent circle
- [ ] Circle sizes visibly differ, matching the per-tower `range` (Downtown is the largest at 2200)
- [ ] Markers do **not** crowd the minimap while driving (they are deliberately short-range)
- [ ] Restart the resource twice, reopen the map: still eight circles, **not** sixteen
- [ ] Set `Blips.Enabled = false`, restart: no markers, no circles
- [ ] Set `Blips.Enabled = true` but `Enabled = false`, restart: blips still draw

That last one is intentional. Blips are independent of the master switch so a network can be laid
out and inspected before service gating is turned on.

---

## C. Signal bars degrade

The bug this system exposed: the icon used to render four bars at any non-zero level.

- [ ] Drive slowly from **A** to **G** with the phone open, watching the status bar
- [ ] Bars step down 4 → 3 → 2 → 1 → "No Service", rather than jumping straight from full to none
- [ ] Bars that are not reached appear **dimmed**, not missing, so the icon keeps its shape
- [ ] Drive back from **G** to **A**: bars climb again
- [ ] Stand still at **C**: the icon does not flicker or oscillate between 2 and 3

Flicker while stationary would mean the level is landing on a bar boundary. Move 50 units and
retry before reporting it.

---

## D. Capability thresholds

At each point, open the phone and try each action.

**At D (data drops, calls and texts fine)**
- [ ] Photogram, Birdy, Mail, Marketplace, Banking: refuse with a "No Service" message
- [ ] Placing a call still connects
- [ ] Sending a text still delivers

**At F (texts only)**
- [ ] Dialling any number is refused with "No Service"
- [ ] Sending a text still delivers
- [ ] Data apps still refuse

**At G (dead)**
- [ ] Status bar reads "No Service"
- [ ] Dialling refused, texting refused, data apps refused

---

## E. Apps that must keep working with no signal

Stand at **G** for all of these. Every one is in the `Offline` allow-list for a stated reason, and
a failure here is a real bug rather than the feature working.

- [ ] **Settings** opens and a change (ringtone, wallpaper) saves and survives a phone reopen
- [ ] **Notes** opens, existing notes readable, a new note saves
- [ ] **Files/Documents** opens and lists documents
- [ ] **Photos** opens and shows the camera roll
- [ ] **Contacts** opens and the phone book is readable
- [ ] **Messages** opens and existing threads are readable (sending fails, reading must not)
- [ ] **Phone** app opens and the call log is readable
- [ ] **Voice Memos** opens and the library is readable
- [ ] **Music** opens and plays
- [ ] **Clock** works
- [ ] **Radio** connects to a frequency (radio is RF, not cellular)
- [ ] **Cookie** clicker saves progress without a "No Service" error
- [ ] **AirShare** to a nearby player works
- [ ] App switcher, control centre, lockscreen, home layout editing all behave normally

---

## F. Calls between two players

`P1` = you, in full service. `P2` = second player.

- [ ] **P2 at G**, P1 dials P2 → refused with **"This number is currently unavailable"**
- [ ] The message must **not** say "No Service"

That wording is a deliberate security property, not a cosmetic choice. Every target-side refusal
(out of range, blocked, airplane mode) uses the same string so a caller cannot dial repeatedly and
use the error text to work out *why* someone is unreachable.

- [ ] **P1 at F** (texts only), P1 dials P2 in full service → refused with "No Service"
- [ ] **Both in full service** → call connects and audio works normally
- [ ] **P2 at D** (data blocked, calls fine) → call connects **and audio works**

That last one matters: call audio signalling rides the `voice` namespace. If it were gated on data,
calls would connect silently at D.

- [ ] Group/conference call with three targets, one of them at **G** → the other two still ring

A dead zone must remove one participant, not fail the whole call.

- [ ] Call a mobile at **G** from a **payphone** → refused with the same unavailable wording

---

## G. Texts and withheld replay

- [ ] **P2 at G**, P1 texts P2 → P1's message sends and appears in P1's thread
- [ ] P2 receives **nothing** at that moment: no notification, no badge, no thread update
- [ ] P2 drives from **G** back to **A** with the phone **open** → the held texts arrive
- [ ] Repeat, but P2 travels with the phone **closed**, then opens it at A → held texts arrive on open

Both paths must work. The client reports the transition, but a player who never opens their phone
still gets everything when they next do.

- [ ] Send P2 several texts while they are at G, from two different senders → all arrive, correct threads
- [ ] P2 stays at G for a while, P1 keeps texting → nothing is lost or duplicated
- [ ] P2 **logged out** entirely (not in a dead zone), P1 texts them → normal delivery on next login

An offline player is not "out of range". Their mail must be stored the ordinary way.

---

## H. Mid-call safety

This is a regression test for a bug found during development.

- [ ] Start a call while at **A**
- [ ] Drive out to **E** (still call-capable) while on the call
- [ ] **Hang up** → it works
- [ ] Repeat and use **decline** on an incoming call at low signal → it works

If either is refused, the `call` namespace has fallen out of the `Offline` list and players can be
stranded in calls they cannot end.

---

## I. Dropped calls

`DropCallsAfter` (default 6 seconds) ends a live call once a participant loses call-grade signal.

- [ ] P1 and P2 start a call, both in good coverage
- [ ] P2 drives out past **F** into **G** and stays there
- [ ] After roughly six seconds the call ends for **both** of them
- [ ] P2 (the one who left) gets a phone notification: **Call Dropped / You lost service**
- [ ] P1 gets: **Call Dropped / The other caller lost service**
- [ ] The call appears in both recent-call lists with its real duration

**The grace period, which is the part most likely to be wrong:**

- [ ] P2 dips briefly into **G** and comes straight back to **E** within a couple of seconds
- [ ] The call **survives**. A moment on the wrong side of the line must not kill it
- [ ] Repeat several times in a row: the countdown resets each time, so the call still survives

**Payphones are exempt:**

- [ ] P1 calls a payphone (or answers one) and walks the mobile side into **G**
- [ ] The mobile side drops the call as normal
- [ ] Now check the reverse: a payphone leg is never the reason a call drops. A booth is a
      landline and has no cell signal to lose, so standing a booth in a dead zone changes nothing

**Config:**

- [ ] Set `DropCallsAfter = 0` → the call ends almost immediately on losing coverage
- [ ] Set `DropCallsAfter = false` → calls survive anywhere once connected, the old behaviour
- [ ] With `Enabled = false`, calls never drop regardless of this setting

**Ringing calls:** an unanswered ring is left alone, it times out on its own. Only connected calls
are watched.

---

## J. Exports

Fastest route is `/celltest compare`, which exercises both sides at once and prints the
difference. Run it at each waypoint on the test line.

Client (`/celltest client`):

- [ ] `getServiceLevel()` → 0.0 to 1.0, matching your position
- [ ] `getServiceBars()` → 0 to 4, matching what the status bar shows
- [ ] `hasService()` → defaults to the data capability
- [ ] `hasService('text' / 'call' / 'data')` → matches the bars table above
- [ ] `getCellTowers()` → eight masts as `{ tower = vector3, range = number }`, **ranges included**

Server (`/celltest server` and `/celltest towers`):

- [ ] `getServiceLevel(source)` → matches that player's client reading
- [ ] `hasService(source, 'call')` → matches
- [ ] `getCellTowers()` → the same eight masts, ranges included

- [ ] With `Enabled = false`, both `getCellTowers` return an **empty** array
- [ ] Mutating the returned array does not affect anything: run `/celltest towers` twice and
      confirm the second call still reports eight masts with their original ranges

That last one matters because the export hands out a table. It is built fresh on every call
precisely so a consumer cannot reach through it into the running config.

The server derives the level from its own view of where the player is, so the two sides agreeing
is the point of the check. A mismatch larger than a rounding wobble means client and server
disagree about position, which would undermine the whole trust model.

---

## K. lb-phone compatibility

Use `/celltest lb` and `/celltest lbclient`.

- [ ] `GetCellTowers()` (client) → array of eight `vector3`
- [ ] `GetCellTowers()` (server) → the same eight
- [ ] Ranges are **absent** from the result. This is correct: lb-phone's own config has no
      per-tower range, so the export matches their shape. `/celltest towers` is the sd-phone
      variant that keeps them.
- [ ] With `Enabled = false`, both return an **empty** array
- [ ] `/celltest bars 1` → status bar drops to one bar
- [ ] While overridden, calls and texts still follow your **real** position, not the forced bars
- [ ] `/celltest bars 0` → status bar reads "No Service"

Zero bars is what drives the dead-zone label, so that is the expected result rather than an empty
icon. The check is that `0` is honoured at all: it must not be mistaken for "clear the override"
and snap back to the real reading.
- [ ] `/celltest bars clear` → returns to the real reading

---

## L. Robustness

Each of these must fail **open**, leaving phones fully working. A config mistake must never take a
server's phones down.

- [ ] Add a tower with `range = 0` → ignored, others still work
- [ ] Add a tower with a negative range → ignored
- [ ] Add an entry with no `tower` field → ignored
- [ ] Make **every** entry malformed → every phone reads full service everywhere
- [ ] Delete the `Thresholds` table → nothing is blocked
- [ ] Set `Bars` to a single cutoff → icon still renders, no crash

---

## M. Performance

- [ ] Holster the phone and drive across the map: no measurable resource load
- [ ] `resmon` while the phone is **closed** → the service tick contributes nothing

The tick only runs while the phone is on screen, so a closed phone should cost exactly what it did
before this feature.

- [ ] Stand still with the phone open for a minute → the tick does not spam NUI messages
      (pushes happen only when the bar count or the data verdict actually changes)

---

## What is already automated

Do not spend manual time re-testing these; they run in CI.

| Covered | Where |
|---|---|
| Tower maths, `max` selection, Z ignored, fail-open on bad config | `tests/lua/celltowers_test.lua` |
| Bar bucketing at cutoff boundaries, threshold tiers | same |
| Service store clamping, dead-zone detection | `web/src/stores/serviceStore.test.ts` |
| Status bar icon renders a distinct result per level | `web/src/lib/signal.test.ts` |

## Known gaps

- **Voice quality does not degrade with signal.** A call either holds or drops; there is no
  attenuation or garbling on the way down. Section I covers the drop.
- Nothing here has been verified against a live server by the author. Sections H and I in
  particular were written from code rather than play.
