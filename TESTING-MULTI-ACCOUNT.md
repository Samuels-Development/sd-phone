# Multi-account - test plan

Manual in-game verification for holding more than one account per app, across every app that
signs in through the shared accounts engine. Squawk is the newest arrival (PR #176) and is the
only one that ships a one-time database migration, so **section A runs first and runs once**.

Work top to bottom the first time. Sections C onward assume you completed section B.

---

## The apps

| App | Signs in through | Cap | Where "Switch account" lives | SMS short code |
|---|---|---|---|---|
| **Photogram** | accounts engine | `configs/accounts.lua` | Profile → Edit profile → Switch account | 74682 |
| **Cherry** | accounts engine | `configs/accounts.lua` | Profile → Edit profile → Switch account | 24377 |
| **Vibez** | accounts engine | `configs/accounts.lua` | Profile → Switch account | 84239 |
| **Ryde** | accounts engine | `configs/accounts.lua` | Account → Switch account | 79333 |
| **Squawk** | accounts engine | `configs/accounts.lua` | Profile → Edit profile → Switch account | 24739 |
| **Mail** | its own model | `configs/mail.lua` → `MaxAccountsPerPlayer = 5` | none, by design | 62450 |

**Mail is deliberately different and is not a bug.** Mail signs you into every mailbox at once and
you pick the active one from the inbox header. There is no switcher because there is nothing to
switch: all five are live simultaneously. Everything in sections C, E and F is therefore
Mail-exempt. Section G still applies to it.

**Squawk is the odd one out among the engine apps.** It is the only one that is *not* in
`DIRECT_APPS`: it owns its own register/login callbacks because it writes a profile row alongside
the account. It reaches the switcher through a separate `SWITCH_APPS` whitelist. If exactly one
app misbehaves in these tests, expect it to be this one, and expect the failure to look different
from the others.

---

## Before you start

1. Check out the branch and rebuild the UI. `web/build` is not in git, so a stale bundle will
   test the old code and quietly pass everything:
   ```
   cd web && npm ci && npm run build
   ```
2. `ensure sd-phone`
3. **Create a Mail account first, before anything else.** Every other app's registration
   validates its recovery email against `phone_mail_accounts`, so without a mailbox you cannot
   create a single account anywhere and section B stalls on step 1.
4. `configs/accounts.lua` → note `MaxPerApp`. It ships at **3**. To make the cap test in B4 quick,
   set it to `2`, restart, and put it back when you are done.
5. Have a second character (or a second player) available. Sections E and F cannot be tested solo.
6. Keep a database client open. Several checks below cannot be seen from the phone.

### The registration rules, so a refusal is not mistaken for a bug

| Rule | Message you should see |
|---|---|
| Recovery email must be an existing Mail address | `No Mail account with that address exists` |
| Recovery phone must be **your own** number | `Use your own phone number so you can recover the account` |
| Most apps need email **or** phone | `Add an email or phone number so you can recover the account` |
| Squawk needs an **email specifically** | `Email is required so you can recover the account` |
| Usernames are unique per app | `That username is taken` |
| Cap reached, cap is 1 | `You already have an account for this app` |
| Cap reached, cap is above 1 | `You can have at most N accounts for this app` |

---

## A. The Squawk migration

**Run this once, on a database that already holds Squawk data.** If your database has never had a
Squawk account, skip to B. Take the readings in A1 *before* you restart onto the new build.

### A1. Before the restart, on the old build

```sql
SELECT COUNT(*) FROM phone_birdy_profiles;
SELECT COUNT(*) FROM phone_birdy_posts;
SELECT COUNT(*) FROM phone_birdy_likes;
SELECT COUNT(*) FROM phone_birdy_reposts;
SELECT COUNT(*) FROM phone_birdy_follows;
SELECT COUNT(*) FROM phone_birdy_dms;
SELECT COUNT(*) FROM phone_birdy_notifications;
```

Then count the rows the migration is **supposed** to delete: rows whose citizenid owns no Squawk
profile cannot be attributed to an account, so they are dropped. Measure them now or a legitimate
drop will look like data loss later.

```sql
SELECT
  (SELECT COUNT(*) FROM phone_birdy_posts p
     LEFT JOIN phone_birdy_profiles pr ON pr.citizenid = p.author_cid WHERE pr.citizenid IS NULL) AS orphan_posts,
  (SELECT COUNT(*) FROM phone_birdy_likes l
     LEFT JOIN phone_birdy_profiles pr ON pr.citizenid = l.citizenid WHERE pr.citizenid IS NULL) AS orphan_likes,
  (SELECT COUNT(*) FROM phone_birdy_dms d
     LEFT JOIN phone_birdy_profiles pr ON pr.citizenid = d.from_cid WHERE pr.citizenid IS NULL) AS orphan_dms;
```

Finally, pick one DM you personally reacted to and note its id. You will re-check it in A4.

```sql
SELECT id, reactions FROM phone_birdy_dms WHERE reactions IS NOT NULL AND reactions <> '' LIMIT 5;
```

The values are arrays of **citizenids** right now. That is the point of A4.

### A2. Restart

`ensure sd-phone`. Watch the console.

- **Expected:** no schema error from `birdy`. The boot summary reports schemas ready.
- **If it fails:** the migration is transactional by retry, not by rollback. It leaves the profile
  table keyed the old way and runs again from the top on the next boot. Fix the cause, restart,
  do not hand-edit the tables.

### A3. The migration ran, once

```sql
SELECT name, applied_at, stats FROM phone_migrations WHERE name = 'birdy_handle_rekey';
```

- **Expected:** exactly one row. `stats` carries the per-table row counts it mapped.
- Restart the resource a second time and re-run this query. Still one row, same `applied_at`.

Now confirm the shape actually changed:

```sql
SHOW COLUMNS FROM phone_birdy_profiles;      -- PK is handle; citizenid still present, indexed
SHOW COLUMNS FROM phone_birdy_posts;         -- author, no author_cid
SHOW COLUMNS FROM phone_birdy_dms;           -- from_handle / to_handle, no from_cid / to_cid
SHOW COLUMNS FROM phone_birdy_notifications; -- recipient / actor, no *_cid
```

### A4. Nothing was lost, and the reactions still know who you are

Re-run the counts from A1 with the new column names. Each table should be **unchanged, minus the
orphans you measured**, and nothing else.

Then re-read the DM you noted:

```sql
SELECT id, reactions FROM phone_birdy_dms WHERE id = '<the id from A1>';
```

- **Expected:** the arrays now hold **handles**, not citizenids.
- **This is the check most worth doing.** No `ALTER TABLE` can reach inside a JSON column, so this
  is the one part of the migration that is a Lua rewrite rather than DDL. If it silently no-ops,
  every reaction in the game still renders, but the "this one is mine" highlight is wrong for
  everybody, forever.

### A5. The app still works on migrated data

Open Squawk on a character that had an account before the upgrade.

- [ ] You are still signed in, as the same handle
- [ ] The feed shows the same posts
- [ ] Your profile shows the same follower / following counts
- [ ] Your old DM threads are still there, with the right names on them
- [ ] A DM you reacted to still shows **your** reaction as yours (highlighted), not as someone else's
- [ ] Your notification bell count is unchanged

---

## B. Creating a second account

Do this for **Photogram, Cherry, Vibez, Ryde and Squawk**. Mail is exempt (it has always held
several mailboxes; see the note at the top).

1. Sign in to your existing account. Note the username.
2. Sign out. (Squawk: Profile → Edit profile → Sign Out.)
3. Register a second account with a **different username** and the **same** recovery email and
   phone as the first.
   - [ ] It succeeds. Sharing recovery contacts between your own accounts is allowed on purpose.
4. Repeat until the cap refuses you.
   - [ ] The refusal names the number: `You can have at most N accounts for this app`
   - [ ] With `MaxPerApp = 1` the wording changes to `You already have an account for this app`
5. **Answer "Save" to the "Save to Passwords?" prompt on at least two accounts per app, and
   "Not Now" on one.**
   - This is load-bearing for section C and is the single most likely thing to look like a bug.
     The switcher lists what is in your Passwords vault, not what you have created. An account you
     declined to save is **invisible to the switcher by design**. You can still sign into it by
     typing the password.

Database check, per app:

```sql
SELECT app, username, created_by, email, phone FROM phone_app_accounts ORDER BY app, username;
SELECT * FROM phone_app_sessions WHERE citizenid = '<your cid>';
```

- [ ] One `phone_app_accounts` row per account you created, `created_by` = your citizenid
- [ ] **Exactly one** `phone_app_sessions` row per app for your citizenid. Never two. If you ever
      see two rows for the same `(app, citizenid)`, that is the bug the `NOT EXISTS` guard in
      `migrateLegacy` was added to prevent; note which app and how you got there.

---

## C. Switching

For each of Photogram, Cherry, Vibez, Ryde and Squawk:

1. Open the switcher (see the path in the table at the top).
   - [ ] It lists the accounts you saved to Passwords, and a tick against the one you are in
   - [ ] The account you answered "Not Now" to is absent. Expected.
   - [ ] With no saved accounts at all: `No other saved accounts. Sign in once and your login is
         saved here.`
2. Pick the other account.
   - [ ] The app reloads as that account: display name, handle and avatar all change
   - [ ] The content is the **new** account's, not a mix
3. Switch back.
   - [ ] Your original account is intact and unchanged

**Stale-password case.** Change one account's password from another character, then try to switch
into it from the character whose vault still holds the old one.

- [ ] `Saved password no longer works. Sign in again`
- [ ] You are **not** switched. A stale vault entry must not be treated as authority.

**Session-state leak.** Before switching, leave the app mid-state: a half-typed post, a tab other
than the default, a drill-in open.

- [ ] After the switch the app is at its default state, not holding the previous account's drafts
      or open screens

---

## D. Squawk content isolation

This is what the refactor exists for. Two Squawk accounts, `main` and `alt`.

| Action as `alt` | Expected when you switch back to `main` |
|---|---|
| Post something | `main`'s profile post count is unchanged, and the post is attributed to `alt` in the feed |
| Like a post | `main` shows that post as **not** liked |
| Repost a post | `main` shows it as **not** reposted |
| Follow somebody | `main`'s following count is unchanged |
| Get a follower | `main`'s follower count is unchanged |
| Receive a DM | the thread is **not** in `main`'s inbox |
| Receive a notification | `main`'s bell count is unchanged |

- [ ] The springboard badge on the Squawk icon reflects the account you are **currently** signed
      into, not a sum of both
- [ ] Set `alt` to Private account. From `main`, `alt`'s posts and follow lists are hidden until
      `main` follows it

**DM your own alt.** From `main`, open a DM to `alt` and send a message. Switch to `alt`.

- [ ] The message is there, addressed correctly, marked unread
- [ ] Replying and switching back shows the reply under `main`

---

## E. What must NOT reset when you switch

**This is a security property, not a feature.** Rate limits and mutes are keyed to the character,
never to the account. If any of these pass on the alt, the multi-account feature is an exploit.
Needs an admin.

1. Admin-mute your character on the **birdy** scope (admin panel → player → Moderation).
2. Try to post on Squawk.
   - [ ] `You have been muted by an admin.`
3. Switch to your alt. Try to post.
   - [ ] **Still muted.** Same message.
4. Unmute. Repeat the whole test with the **photogram**, **vibez** and **cherry** scopes on their
   own apps.
5. Now the throttle. Post repeatedly on Squawk until you get `Slow down`.
6. Switch to the alt immediately and post.
   - [ ] **Still throttled.** The budget belongs to the character.

---

## F. One account, two characters

Squawk, Photogram, Cherry, Vibez and Ryde all allow this: an account is global, and any character
who knows the password can sign into it. Needs two characters online.

1. Sign character A and character B into the **same** Squawk account.
2. From a third account, send that account a DM.
   - [ ] **Both** A and B receive it live, without reopening the app
3. From a third account, like one of its posts.
   - [ ] **Both** A and B get the notification and the badge
4. Have A sign out.
   - [ ] B stays signed in
   - [ ] The admin panel still shows the account as signed in (it is: B is in it)

Database check while both are in:

```sql
SELECT s.citizenid, a.username FROM phone_app_sessions s
JOIN phone_app_accounts a ON a.id = s.account_id WHERE a.app = 'birdy';
```

- [ ] Two rows, one per character, both pointing at the same `account_id`

---

## G. Recovery, per app

For each of the six apps including Mail, from the sign-in screen → Forgot password:

1. Enter the recovery **email**.
   - [ ] The code arrives as a real mail in the Mail app, from the app's name
   - [ ] Mail refuses this route: `Use the phone number linked to the account`. Mail is SMS-only
         for recovery, by design.
2. Enter the recovery **phone number**.
   - [ ] The code arrives as an SMS from the short code in the table at the top
3. Enter the wrong code five times.
   - [ ] `Too many wrong attempts. Request a new code`
4. Request four codes inside ten minutes.
   - [ ] `Too many codes requested. Try again in a few minutes`
5. Reset the password, then sign in with the new one.
   - [ ] It works
   - [ ] The Passwords app entry for that account shows the **new** password
6. **Shared recovery contact.** Both your accounts use the same email. Request a reset with it.
   - [ ] `More than one account uses that contact. Ask an admin for help`
   - [ ] This is expected. Recovery identifies an account by its contact, and a shared contact
         cannot. Use an admin password reset for these.

---

## H. Admin panel

Open a player who holds several Squawk accounts.

1. Overview tab → **Squawk accounts** card.
   - [ ] Every account they created **or are signed into** is listed, not just one
   - [ ] Each shows display name, verified tick where applicable, and either `signed in` or its
         creation date
   - [ ] `signed in` is truthful: sign the character out and it flips, without a restart
2. Squawk tab.
   - [ ] A verify button per account
   - [ ] Verifying one account leaves the others alone. Check the tick in-game on both.
   - [ ] The post list covers posts from **all** their accounts
   - [ ] The post count on the Overview tab matches
3. Force logout → Squawk.
   - [ ] The player is signed out in-game
   - [ ] `phone_birdy_profiles.logged_in` for that handle is `0`
4. Accounts tab.
   - [ ] Their current session account per app is listed

---

## I. Deleting, and wiping

1. Sign into your Squawk alt → Edit profile → Delete Account.
   - [ ] The alt's posts, likes, follows, DMs and notifications are gone
   - [ ] **Your main is untouched.** Posts, followers, DMs all still there.
   - [ ] The alt's entry is gone from the Passwords app
   - [ ] The alt's handle can be registered again
2. `/wipemyphone` as an admin, on a character holding several Squawk accounts.
   - [ ] Every Squawk account they created is gone, not just the one they were signed into
   - [ ] `phone_app_accounts` has no leftover `birdy` row for those handles. A leftover is a login
         that succeeds and then lands on a profile that no longer exists.

```sql
SELECT * FROM phone_birdy_profiles WHERE citizenid = '<wiped cid>';
SELECT * FROM phone_app_accounts WHERE app = 'birdy' AND created_by = '<wiped cid>';
```

- [ ] Both empty

---

## What is already automated

Do not re-test these by hand; they run in CI.

| Area | Where |
|---|---|
| The Squawk re-key migration: upgrade path, reaction rewrite, fresh-install no-op, migration-before-CREATE ordering | `tests/lua/birdy_rekey_test.lua`, 12 assertions |
| Accounts porters from lb-phone, including sessions | `tests/lua/port_*_test.lua` |
| Frontend units | `web` → `npm test`, 405 assertions |

What no test can reach, and why every section above is manual: none of it mocks a live
`phone_app_sessions` table, two connected players, or CEF. The push fan-out in section F and the
mute behaviour in section E in particular have no automated coverage at all.

---

## Known quirks that are not bugs

- **`phone_birdy_profiles.logged_in` can be stale.** It is a legacy per-account column kept for the
  one-time credential import. It does not track who is in an account right now, which is why the
  admin panel derives "signed in" from live sessions instead. Do not use the column to judge a
  test result.
- **The switcher lists your Passwords vault, not your accounts.** Covered in B5.
- **Mail has no switcher.** Covered at the top.
- **lb-phone Twitter logins are still deferred.** `server/migrate/port/sessions.lua` counts them as
  `deferred` and leaves its migration domain unmarked on purpose. Squawk accepts several accounts
  now, but nothing has ported lb's Twitter profiles across yet, so there is no account for those
  logins to attach to. A migration report showing `deferred > 0` for sessions is correct.
