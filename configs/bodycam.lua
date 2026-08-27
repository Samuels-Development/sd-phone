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
        -- pass through the lens when they run, close enough that it still reads as worn rather
        -- than floating. A ped leans into a sprint, so the shoulders travel further forward than
        -- the hips this is measured from: too small a figure and the officer clips the picture.
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
        -- How close geometry may come before it stops being drawn. Small, so the officer's own
        -- arms enter the frame instead of being clipped away.
        NearClip = 0.10,
    },

    Dashcam = {
        -- Whether an occupied police vehicle gets its own tile in the grid.
        Enabled = true,

        -- Where the camera sits in the vehicle, measured from the vehicle's origin. Forward puts
        -- it at the windscreen, Height at roughly mirror level.
        Mount = {
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

        -- Days a recording is kept before it is pruned. 0 keeps them forever.
        KeepDays = 30,

        -- Recordings one officer's terminal may store. The oldest is dropped past this.
        MaxPerOfficer = 50,
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
