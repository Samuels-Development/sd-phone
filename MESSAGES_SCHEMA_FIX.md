# Fix: `Unknown column 'conversation' in 'where clause'`

## The error

```
SCRIPT ERROR: @sd-phone/server/messages/store.lua:212: sd-phone was unable to execute a query!
Query: SELECT 1 AS hit FROM phone_messages WHERE citizenid = ? AND conversation = ? LIMIT 1
Unknown column 'conversation' in 'where clause'
```

## Why it happens

`phone_messages` is created with `CREATE TABLE IF NOT EXISTS`, which does nothing when the table
already exists. A server carrying an older or foreign `phone_messages` keeps whatever shape it had,
so the column is never added. The boot succeeds silently and every message send then fails.

Fixed in source by back-filling the columns at boot. The SQL below does the same thing by hand for
anyone running a release build.

---

## Step 1: diagnose (read-only, changes nothing)

```sql
SELECT e.col AS expected_column,
       IF(c.COLUMN_NAME IS NULL, 'MISSING', 'ok') AS status
FROM (SELECT 'conversation' AS col UNION ALL SELECT 'mid' UNION ALL SELECT 'sender'
      UNION ALL SELECT 'direction' UNION ALL SELECT 'kind' UNION ALL SELECT 'body'
      UNION ALL SELECT 'meta' UNION ALL SELECT 'is_read' UNION ALL SELECT 'withheld'
      UNION ALL SELECT 'created_at' UNION ALL SELECT 'id' UNION ALL SELECT 'citizenid') e
LEFT JOIN information_schema.COLUMNS c
       ON c.TABLE_SCHEMA = DATABASE()
      AND c.TABLE_NAME   = 'phone_messages'
      AND c.COLUMN_NAME  = e.col
ORDER BY status DESC, e.col;
```

A healthy install returns `ok` for all twelve rows.

**If `id` or `citizenid` come back MISSING, stop.** The fix below will not help, that table is not a
sd-phone table. Send the output of `SHOW CREATE TABLE phone_messages;` instead.

---

## Step 2: back up

```sh
mysqldump -u USER -p DBNAME phone_messages > phone_messages_backup.sql
```

---

## Step 3: fix (MariaDB)

This is what nearly every FiveM server runs. `IF NOT EXISTS` makes it safe to run even if some of
the columns are already present.

```sql
ALTER TABLE phone_messages
  ADD COLUMN IF NOT EXISTS mid          VARCHAR(16)  NULL,
  ADD COLUMN IF NOT EXISTS conversation VARCHAR(48)  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sender       VARCHAR(32)  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS direction    VARCHAR(16)  NOT NULL DEFAULT 'in',
  ADD COLUMN IF NOT EXISTS kind         VARCHAR(16)  NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS body         TEXT         NULL,
  ADD COLUMN IF NOT EXISTS meta         JSON         NULL,
  ADD COLUMN IF NOT EXISTS is_read      TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withheld     TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at   BIGINT       NOT NULL DEFAULT 0;

ALTER TABLE phone_messages
  ADD INDEX IF NOT EXISTS idx_phone_messages_mid    (mid),
  ADD INDEX IF NOT EXISTS idx_phone_messages_thread (citizenid, conversation, created_at),
  ADD INDEX IF NOT EXISTS idx_phone_messages_unread (citizenid, is_read);

UPDATE phone_messages SET mid = id WHERE mid IS NULL;
```

Then restart `sd-phone`.

---

## Step 3 (alternative): MySQL 8

MySQL 8 has no `ADD COLUMN IF NOT EXISTS`, so the block above fails as a whole. Run Step 1 first,
then run only the lines for the columns reported `MISSING`, with `IF NOT EXISTS` removed:

```sql
ALTER TABLE phone_messages
  ADD COLUMN conversation VARCHAR(48) NOT NULL DEFAULT '';
```

Same for the indexes, drop `IF NOT EXISTS` and only add the ones that are absent:

```sql
SHOW INDEX FROM phone_messages;
```

---

## What to expect afterwards

**Sending and receiving work again immediately** after the restart.

**Existing messages will not reappear in threads.** Rows added the column get `conversation = ''`,
so they do not map to any conversation and the back-catalogue reads as empty. Nothing is deleted,
which is what the backup in Step 2 is for. If that history matters, `SHOW CREATE TABLE
phone_messages;` will show whether an older column holds the thread key so it can be copied across.

**Updating later is safe.** The source fix uses the same column names, types and defaults, so
`ensureColumns` finds everything present at boot and does nothing. No double migration, no conflict.
