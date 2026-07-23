-- Files app - private per-character documents. Text notes, imported photos and
-- external files persist server-side keyed by citizenid, organised into folders
-- that follow the character (or phone, under unique SIMs) across sessions.
return {
    MaxDocuments    = 200,    -- documents a player may keep at once
    MaxFolders      = 60,     -- folders a player may create
    MaxTextLength   = 25000,  -- characters of text stored per document
    MaxNameLength   = 60,     -- max length of a document or folder name
    MaxFolderDepth  = 5,      -- deepest nesting allowed in the folder tree
    AllowShare      = true,    -- whether AirShare to a nearby phone is offered
    MaxSignatureLength = 150000, -- characters of a drawn-signature image data-URL
}
