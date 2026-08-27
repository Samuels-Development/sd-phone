-- Police bodycams and vehicle dashcams, watched from the MDT's Cameras section.
--
-- The picture is rendered by the TERMINAL, not by the officer. When a dispatcher opens a
-- unit, their own client quietly moves to that officer, bolts a camera to the officer's
-- chest and renders it. The officer is never touched: they keep playing on whatever
-- camera they like, in third person or first, and their client does no encoding and
-- sends no video anywhere.
--
-- That is what makes the feed a real body-worn camera rather than a copy of the
-- officer's screen. It also means a camera costs no bandwidth at all: nothing is
-- relayed, because nothing leaves the watcher's machine.
--
-- The cost is that a terminal watches one unit at a time, and that the watcher's own
-- character is parked, hidden and immovable while they watch. They get it back the
-- moment they leave the camera.
return {
    -- Whether the Cameras section works at all.
    Enabled = false,

    -- Framework jobs that carry a bodycam. Leave empty to mean "every police department in
    -- configs/mdt.lua". A job that is not a police department never gets a camera whatever
    -- is listed here, because the Cameras section is police-only on the server.
    Jobs = { 'police', 'bcso', 'sasp' },

    -- Whether an officer must be on duty to appear in the grid.
    RequireDuty = true,

    -- Where the camera sits on the officer and how it sees. The offsets are measured from the
    -- ped's own origin, which sits at the HIPS rather than the feet, so Height is the rise from
    -- the waist to the top of the chest and not a height off the ground.
    Mount = {
        -- Forward of the chest, in metres. Far enough out that the officer's own body does not
        -- fill the lens, close enough that it still reads as worn rather than floating.
        Forward = 0.34,
        -- Above the ped's origin, in metres. 0.38 lands on the upper chest, where a real
        -- body-worn camera clips on.
        Height = 0.38,
        -- Sideways from the centre of the chest, in metres. Negative is the officer's left,
        -- which is the shoulder most departments mount on.
        Side = 0.0,
        -- Field of view. Body-worn cameras are wide; this is deliberately wider than the game's
        -- own first person.
        Fov = 78.0,
        -- Downward tilt in degrees, because a camera on a chest points slightly at the ground.
        Pitch = -8.0,
        -- How close geometry may come before it stops being drawn.
        NearClip = 0.10,

        -- The same figure while the officer is running. A ped pitches forward into a run and the
        -- camera does not, so the head swings toward the lens and for a moment you see the inside
        -- of their face. This rejects anything that close for as long as they are running, and
        -- drops back to NearClip the moment they stop.
        --
        -- It also drops their arms and anything held while running, which is the deliberate trade:
        -- a clean picture is worth more than seeing their hands. Lower it toward NearClip to keep
        -- the arms, at the cost of the head clipping through on the first strides of a sprint.
        NearClipRunning = 0.32,
    },

    -- How the picture is graded, applied in the ENGINE rather than drawn over the top. That
    -- matters twice over: it looks like footage rather than like a filter, and because it is part
    -- of the rendered frame it is also what gets recorded.
    Look = {
        -- A GTA timecycle modifier applied for as long as a camera is open. Set to false for a
        -- clean picture. Ones worth trying: 'scanline_cam' and 'scanline_cam_cheap' are the
        -- in-game security feeds, 'CAMERA_secuirity' is darker and greener, and
        -- 'Island_CCTV_ChannelFuzz' adds channel noise on top.
        Timecycle = 'scanline_cam_cheap',

        -- How strongly it is applied, 0.0 to 1.0. Low, because a body-worn camera is a cheap
        -- sensor and not a broken one.
        Strength = 0.4,

        -- Handheld movement, as a shake amplitude. A camera strapped to a moving person is never
        -- perfectly still, and a perfectly still one is the main reason a feed reads as a video
        -- game rather than as footage. 0 switches it off.
        Shake = 0.35,
    },

    Dashcam = {
        -- Whether a police vehicle gets its own tile in the grid.
        Enabled = true,

        -- Seconds a dashcam stays on the grid after the officer gets out of the car.
        --
        -- Not a grace period for its own sake: a traffic stop is the moment a dashcam earns its
        -- keep, and it is precisely the moment the officer is stood in front of the car rather
        -- than sitting in it. Dropping the tile the instant they step out would take the camera
        -- away exactly when somebody wants to watch it. 0 keeps the old behaviour.
        LingerSeconds = 180,

        -- Metres the officer may be from the car while that lingering tile lasts. Past this it is
        -- not their car any more, it is one they parked somewhere and walked away from.
        LingerRange = 60.0,

        -- Where the camera sits in the vehicle.
        --
        -- By default it is sized to the vehicle rather than fixed, because one set of offsets that
        -- suits a cruiser puts the lens inside the bonnet of a van and behind the seats of a bike.
        -- The model's own bounding box gives the windscreen: a fraction of the way to the nose and
        -- a fraction of the way to the roof.
        Mount = {
            -- Set to false to ignore everything below and use the fixed offsets instead.
            Auto = true,

            -- Where the camera sits relative to the DRIVER'S SEAT, which is how a real dashcam is
            -- described: behind the rear-view mirror, looking out through the windscreen. Measured
            -- from the seat because every drivable vehicle has one and it is inside the cabin by
            -- definition, so this lands correctly on a cruiser, a van and a bike alike.
            SeatForward = 0.42,
            SeatHeight  = 0.60,

            -- Used only when a vehicle has no driver seat bone to measure from. Fractions of the
            -- model's own size. Less reliable, because a police car's height includes its LIGHTBAR
            -- and a fraction of that sits above the roof rather than under it.
            ForwardFactor = 0.28,
            HeightFactor  = 0.62,

            -- The fixed fallback, used when Auto is false or the model gives nothing usable.
            Forward  = 0.55,
            Height   = 0.65,
            Side     = 0.0,
            Fov      = 70.0,
            Pitch    = -4.0,
            NearClip = 0.15,
        },

        -- Vehicle models that carry a dashcam. Matched on the server against the model the
        -- officer is actually sitting in, so this is the authoritative list.
        Models = {
            'police', 'police2', 'police3', 'police4', 'policeb', 'policet',
            'sheriff', 'sheriff2', 'fbi', 'fbi2', 'riot', 'pranger', 'polmav',
        },

        -- Vehicle classes that carry a dashcam as well (18 is Emergency). A class can only be
        -- read on the client, so this is reported by the officer's own game rather than read
        -- from the vehicle server-side: it decides which tile appears, never who may watch.
        Classes = { 18 },
    },

    -- Recording the watch. Because the picture is rendered on the terminal, the only footage that
    -- can exist is footage somebody watched: there is no stream running when nobody is looking,
    -- so there is nothing to capture. What a terminal watches, it can keep.
    Recording = {
        -- Whether watches are recorded at all. With this off the Cameras section is live only and
        -- the Recordings tab does not appear.
        Enabled = true,

        -- Whether opening a unit starts recording on its own. Left off, the dispatcher presses
        -- record when something is worth keeping, which is far kinder to storage.
        Auto = false,

        -- Seconds a single recording may run before it is closed and uploaded. A cap rather than a
        -- suggestion: the whole clip is held in memory on the server until it is uploaded.
        MaxSeconds = 300,

        -- Recordings shorter than this are thrown away rather than uploaded, so a terminal that
        -- opened the wrong unit for a second does not leave a file behind.
        MinSeconds = 4,

        -- Capture profile. Width is capped by the watching terminal's own game resolution: asking
        -- for more than they render buys nothing but bitrate.
        Fps     = 30,
        Width   = 1280,
        Bitrate = 2500000,

        -- How often (ms) the recorder emits a chunk to the server. Each one is paced onto the wire
        -- rather than blocking the net thread.
        TimesliceMs = 1000,

        -- Send ceiling (bytes/s) each chunk is paced with. Chunks cross the NUI boundary as
        -- base64, which is about a third larger than the encoded video, so leave headroom.
        ChunkBytesPerSec = 2048 * 1024,

        -- Days a recording is kept before it is pruned. 0 keeps them forever, which is the
        -- default: footage is evidence, and quietly deleting it on a timer is the kind of thing
        -- nobody notices until the one clip that mattered has gone. Set a number here only if
        -- storage is the greater worry.
        KeepDays = 0,

        -- Recordings one terminal may hold before the oldest is dropped. Deliberately high rather
        -- than absent: it is a backstop against one dispatcher filling the table forever, not a
        -- retention policy. Recordings shared TO somebody count against theirs too.
        MaxPerOfficer = 1000,
    },

    -- Terminals allowed on one officer's camera at once (0 = unlimited).
    MaxViewers = 6,

    -- Seconds a viewer may go quiet before the server stops counting them as watching. The
    -- terminal refreshes well inside this, so it only fires for a terminal that died without
    -- saying so.
    IdleSeconds = 15,

    -- Whether opening a camera writes a row to the MDT audit log, the same way a handset read
    -- does. The audited action is an officer choosing to watch a particular unit.
    LogViewing = true,
}
