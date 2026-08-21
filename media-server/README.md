# sd-phone media relay (SDMR/1)

A small standalone WebSocket server that carries live video between phones: MDT bodycam and dashcam,
Photogram Live and Vibez Live. A publisher pushes encoded frames as **binary** WebSocket messages and
the relay fans them out to the viewers watching that stream.

It exists because the original transport ran video through the FiveM event bus: the encoder output was
base64 encoded (a third more bytes), pushed across the NUI boundary, relayed as a latent event and
reassembled by the viewer. That path is slow and it is expensive for the game server. This relay carries
raw bytes over one socket per phone and never touches the game thread.

## Two ways to run it

**Inside the resource (the easy one).** With `Media.Enabled = true` and `Media.SelfHost = true` in
`configs/media.lua`, sd-phone starts this code inside FXServer itself. There is no Node to install,
no second process to keep alive, no signing key to generate and no port to choose: the key is minted
for each boot and never leaves the process, and the port is the first free one from 30567. The
console says which port it took.

**On its own (the scalable one).** Set `Media.SelfHost = false` and run `node index.js` here, on this
box or another one, then point `sd_phone_relay_url` and `sd_phone_relay_key` at it. This is the right
shape once the relay is carrying enough traffic to want its own CPU.

Either way you still need TLS in front of it for real players. See TLS below: this is the one part
nothing can do for you.

## What this is not

* **It is not an authorization system.** Every permission decision stays in Lua. The relay only checks
  that a request carries a valid, unexpired, unused token signed by your game server, and that the token
  names the stream and the role being asked for. A token is a receipt that the Lua checks already passed.
* **It is not required.** If you never run it, every feature keeps working exactly as it does today over
  the existing FiveM event path, and MDT bodycams can go straight between two clients over a peer
  connection with no relay at all. sd-phone falls back to the event path the moment the relay is
  unreachable, and there is no user visible error when it is off.
* **It is not a place for permissions, storage or business logic.** It moves bytes between sockets.

## Requirements

* Node.js 16.9 or newer to run standalone. Nothing to install to run it inside FXServer, whose own
  runtime is what executes it there.
* No dependencies. There is no `npm install` step; the `node_modules` folder is never created.
* CommonJS, not ESM, because FXServer's V8 has no ESM loader and this has to load in both.
* One TCP port reachable from your players, and a hostname with a real TLS certificate.

## Quick start

```bash
# 1. Generate a signing key. Keep it secret, it is not your server secret.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Run the relay.
SD_PHONE_RELAY_KEY=<the 64 hex characters from step 1> node index.js

# 3. Confirm it answers.
curl http://127.0.0.1:30567/health
# {"ok":true,"streams":0,"sockets":0,"uptimeMs":1234}
```

Then put the same key, and the public URL, into your `server.cfg` (see below) and restart sd-phone.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `SD_PHONE_RELAY_KEY` | (required) | 64 lowercase hex characters. Must match the `sd_phone_relay_key` convar exactly. The process refuses to start without it. |
| `SD_PHONE_RELAY_HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` when a reverse proxy on the same box is the only thing that should reach it. |
| `SD_PHONE_RELAY_PORT` | `30567` | Bind port. Deliberately clear of the game port and the HTTP endpoint FiveM opens ten above it, which the old default of 30130 collided with. |
| `SD_PHONE_RELAY_ORIGIN` | `https://cfx-nui-sd-phone,https://cfx-nui-sd-tablet` | Comma separated list of browser origins allowed to upgrade. `*` disables the check. |
| `SD_PHONE_RELAY_TLS_CERT` | (empty) | Path to a PEM certificate chain. Leave empty when something else terminates TLS. |
| `SD_PHONE_RELAY_TLS_KEY` | (empty) | Path to the matching PEM private key. |
| `SD_PHONE_RELAY_MAX_SOCKETS` | `512` | Connected phones allowed at once. Past this, upgrades get HTTP 503. |
| `SD_PHONE_RELAY_TRUST_PROXY` | `0` | Set to `1` only when a proxy you control sits in front. It makes the abuse counter read `x-forwarded-for`, which a directly connected client can forge. |
| `SD_PHONE_RELAY_LOG` | `info` | `error`, `warn`, `info` or `debug`. |

The origin check is a cheap filter, not a security control: any non browser client can send whatever
origin it likes. Authentication is the token, and only the token.

## FiveM side

Add these to `server.cfg`. All four are read by sd-phone at runtime.

```cfg
set sd_phone_relay_url "wss://media.example.com/ws"
set sd_phone_relay_key "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
set sd_phone_relay_ttl 45
# Optional, only needed for out of band revocation. Derived from sd_phone_relay_url when unset.
set sd_phone_relay_control_url "https://media.example.com/control"
```

* `sd_phone_relay_url` must be `wss://`. The phone UI runs on the origin `https://cfx-nui-sd-phone`,
  which is a secure context, so the browser refuses a plain `ws://` URL to anything except `localhost`,
  `127.0.0.1` or `[::1]`. That loopback carve out reaches the **player's** own machine, not your server,
  so it is only useful while developing on the same box.
* `sd_phone_relay_key` must be exactly 64 lowercase hex characters and must equal `SD_PHONE_RELAY_KEY`.
  If it is missing or malformed, sd-phone mints no tokens at all and quietly stays on the event path.
* `sd_phone_relay_ttl` is the token lifetime in seconds, clamped to 10 to 120.
* Do **not** reuse `sd_phone_secret` or the contents of `.secret` here. This key is deliberately
  separate so that rotating it rotates only the relay.

## TLS

A self signed certificate does not work. Chromium inside FiveM rejects it with an `error` event and
close code 1006, with no interstitial and no way for the player to accept it. The certificate must chain
to a publicly trusted CA.

**Option A, let the relay terminate TLS.**

```bash
SD_PHONE_RELAY_KEY=... \
SD_PHONE_RELAY_TLS_CERT=/etc/letsencrypt/live/media.example.com/fullchain.pem \
SD_PHONE_RELAY_TLS_KEY=/etc/letsencrypt/live/media.example.com/privkey.pem \
node index.js
```

**Option B, Caddy in front (simplest, certificates are automatic).**

```caddyfile
media.example.com {
    reverse_proxy 127.0.0.1:30567
}
```

**Option C, nginx in front.**

```nginx
location / {
    proxy_pass http://127.0.0.1:30567;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 300s;
    proxy_buffering off;
}
```

With B or C, leave the TLS variables empty, bind the relay to `127.0.0.1`, and set
`SD_PHONE_RELAY_TRUST_PROXY=1` so per address rate limiting sees the real client. Cloudflare in front of
either works, but make sure the WebSocket setting is on for that hostname.

The upgrade is accepted on any path, so `wss://media.example.com/ws`, `.../relay` or the bare host all
work. Pick one and keep it in the convar.

## Running it as a service

**systemd** (`/etc/systemd/system/sd-phone-media.service`):

```ini
[Unit]
Description=sd-phone media relay
After=network-online.target

[Service]
Type=simple
User=fivem
WorkingDirectory=/opt/sd-phone-media-server
ExecStart=/usr/bin/node index.js
Environment=SD_PHONE_RELAY_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
Environment=SD_PHONE_RELAY_HOST=127.0.0.1
Environment=SD_PHONE_RELAY_PORT=30567
Environment=SD_PHONE_RELAY_TRUST_PROXY=1
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now sd-phone-media
journalctl -u sd-phone-media -f
```

**pm2**:

```bash
SD_PHONE_RELAY_KEY=... pm2 start index.js --name sd-phone-media
pm2 logs sd-phone-media
pm2 save
```

**Docker** (a `Dockerfile` is included):

```bash
docker build -t sd-phone-media .
docker run -d --name sd-phone-media -p 30567:30567 \
  -e SD_PHONE_RELAY_KEY=... --restart unless-stopped sd-phone-media
```

The process handles `SIGINT` and `SIGTERM`: it tells every connected phone why it is going away
(close code 1001) before exiting, so clients reconnect or fall back cleanly instead of seeing a
mystery 1006.

## Confirming it works

**1. The process is up.**

```bash
curl -s https://media.example.com/health
# {"ok":true,"streams":0,"sockets":0,"uptimeMs":58231}
```

`/health` needs no authentication and is safe to point a monitor at. It exposes counts only.

**2. A phone reaches it.** Start the relay with `SD_PHONE_RELAY_LOG=debug`, then have a player open the
MDT and watch a bodycam. A healthy session looks like this:

```
2026-08-20 19:41:02.114 DEBUG [socket] upgraded ip=203.0.113.9 origin=https://cfx-nui-sd-phone sockets=1
2026-08-20 19:41:02.140 INFO  [socket] client ready ip=203.0.113.9 sub=ABC12345 src=12 device=phone build=0.9.8
2026-08-20 19:41:02.402 INFO  [stream] publisher attached key=mdt:cam:ABC12345 gen=7 sub=ABC12345 wire=chunks codec=vp8 viewers=0
2026-08-20 19:41:05.881 DEBUG [stream] viewer joined key=mdt:cam:ABC12345 sub=DEF67890 viewers=1
```

**3. Streams are actually flowing.** Ask the control endpoint for stats. The call is signed with the
relay key, so it needs the timestamp and a signature over `<ts>.<body>`:

```bash
TS=$(date +%s000)
BODY='{"op":"stats"}'
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SD_PHONE_RELAY_KEY" -r | cut -d' ' -f1)
curl -s -X POST https://media.example.com/control \
  -H "content-type: application/json" -H "x-sdmr-ts: $TS" -H "x-sdmr-sig: $SIG" -d "$BODY"
```

The reply lists every live stream with its viewer count, frames in, bytes in and whether the relay is
holding an init segment for it. `framesIn` climbing while `viewers` is above zero means video is moving.

The same endpoint takes `{"op":"revoke","key":"mdt:cam:ABC12345","reason":"offduty"}` to tear a stream
down immediately, and `{"op":"gen","key":"...","gen":8}` to force a stream epoch forward. Both are
optional: tokens are short lived and every reconnect re-runs the Lua permission checks anyway.

**4. It is not being used.** If sd-phone never opens a socket, the relay logs nothing and `/health`
reports zero sockets forever. That means the convars are missing or malformed on the FiveM side. Check
that `sd_phone_relay_key` is 64 lowercase hex characters and that `sd_phone_relay_url` starts with
`wss://`. Video keeps working over the event path in the meantime.

## Self test

```bash
node selftest.js
```

It boots a relay on loopback, publishes a synthetic stream and asserts that a viewer receives the init
segment followed by media chunks, then exercises prime replay, whole GOP eviction, the generation fence,
token replay defence, scope enforcement, oversized frames, the stream and socket caps, publisher
supersede, the linger window and the control endpoint. Exit code 0 means every check passed. It needs no
network access beyond loopback and it leaves nothing behind.

## How it behaves under load

| Situation | What the relay does |
| --- | --- |
| A viewer's connection cannot keep up | Drops that viewer's delta frames only, then catches it up at the next keyframe. The publisher and the other viewers are never slowed down. |
| A viewer stays behind for more than 5 seconds | Detaches that viewer from that stream and tells it why. The socket stays open and its other streams keep running. |
| A publisher sends more than its bitrate allows | Drops the excess and warns the publisher. Three seconds over budget closes that socket with 4429. |
| A publisher disappears | Viewers are told immediately, and the stream plus its cached init segment is held for 10 seconds so a reconnecting publisher resumes without anyone rejoining. |
| More than 512 sockets or 256 streams | New connections get HTTP 503. Streams that already exist are never sacrificed to admit a new one. |
| A client floods bad tokens | 20 auth failures from one address in 60 seconds blocks new connections from it for 5 minutes. |

Memory is bounded by design: at most 2 whole GOPs, 120 frames, 2 MiB or 6 seconds are cached per stream,
whichever runs out first, and the init segment (a few hundred bytes) is the only thing kept for the life
of a stream.

## Protocol summary

The full normative specification is the sd-phone Media Relay Protocol Specification (SDMR/1). In short:

* One WebSocket per phone, subprotocol `sdphone-media-v1`, all streams multiplexed over it.
* Control messages are JSON text: `hello`, `publish`, `unpublish`, `join`, `leave`, `keyframe`, `ping`,
  `bye` from the client, and `welcome`, `ready`, `joined`, `stream`, `viewers`, `keyframe`, `drop`,
  `error`, `bye`, `pong` back.
* Media is binary: a 24 byte big endian header (magic `0xA7`, version, kind, flags, stream handle,
  generation, sequence, presentation timestamp in microseconds) followed by the payload. Base64 never
  appears anywhere on this path.
* Frame kinds are `INIT` (codec initialisation), `KEY`, `DELTA` and `JPEG` (still frame mode).

Close codes a server owner may see in a client log:

| Code | Meaning |
| --- | --- |
| 1000 / 1001 | Normal close, or the relay is shutting down |
| 4400 | Malformed message. Usually a version mismatch between the resource and the relay |
| 4401 | Token expired, replayed, or signed with the wrong key |
| 4403 | Token asked for something it does not cover |
| 4408 | The client went quiet for 30 seconds, or never sent `hello` |
| 4409 | Another publisher took the stream at a newer generation |
| 4413 | A binary message over 1 MiB |
| 4429 | Rate limited |
| 4500 | Relay side failure |

## Logging and privacy

Logs are plain lines on stdout (warnings and errors on stderr) so `journalctl`, `pm2 logs` and
`docker logs` all read naturally. Token contents are never logged, in any form, at any level: the log
carries stream keys, citizenids, reason codes and counters only. Media payloads are never written to
disk. The relay stores nothing: there is no database, no recording and no persistence of any kind.

## Files

```
index.js        entry point, reads the environment and starts listening
selftest.js     end to end self test
src/relay.js    HTTP listener, websocket upgrade, control endpoint
src/session.js  one connected phone: hello, publish, join, leave, backpressure
src/stream.js   one stream: prime cache, GOP eviction, viewer fan out
src/hub.js      registry of sockets and streams, heartbeats, abuse counter
src/token.js    SDMR token verification
src/ws.js       minimal RFC 6455 implementation (this is why there are no dependencies)
src/frame.js    the 24 byte binary media header
src/jti.js      replay defence
src/config.js   environment parsing
src/log.js      stdout logging
src/protocol.js every constant in one place
```

## Implementation notes

Two places where the specification left a choice, and what this relay does:

* The generation carried by a `publish` **token** is authoritative, not the one in the message body.
  Otherwise a client could name any generation it liked and evict a legitimate publisher, which is
  exactly what signing the generation is meant to prevent.
* When a publisher is superseded by a newer generation, its viewers get `stream { state: "reset" }` and
  are handed straight to the new publisher. They are not sent `state: "ended"` first, because a viewer
  that has already gone off air would have nothing left to reset.
