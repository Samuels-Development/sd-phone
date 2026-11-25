-- Notes app - private per-character notes. Body text + inline sketches (PNG
-- data URLs) persist server-side, keyed by citizenid, so they follow the
-- character across sessions and devices.
return {
    MaxNotesPerPlayer = 200,
    MaxBodyLength     = 20000,  -- characters of text per note
    MaxSketches       = 12,     -- inline drawings per note
    MaxImages         = 20,     -- attached photo URLs per note

    -- Drawings are stored inline, so they are capped by size as well as count. A drawing that
    -- covers the whole canvas is about 350 KB. A save that would go over either cap keeps its
    -- text and tells the player the drawing did not fit.
    MaxSketchBytesPerNote   = 5 * 1024 * 1024,   -- all the drawings on one note
    MaxSketchBytesPerPlayer = 30 * 1024 * 1024,  -- all the drawings across one character's notes
}
