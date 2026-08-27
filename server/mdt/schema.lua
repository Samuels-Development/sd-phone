---@type table Shared server helpers (server.util): index and constraint bootstrap.
local util       = require 'server.util'
---@type table Column back-fills (server.migrations): applied per table right after its CREATE.
local migrations = require 'server.migrations'

---@type table Schema module; the table returned at end of file. Owns every phone_mdt_* table.
local schema = {}

---@type string[] Every table the MDT owns, in dependency order. server/admin/tables.lua carries
---the same names so `sdphone:wipedata` resets the terminal with the rest of the phone.
schema.tables = {
    'phone_mdt_refs',
    'phone_mdt_profiles',
    'phone_mdt_profile_sessions',
    'phone_mdt_person_records',
    'phone_mdt_vehicles',
    'phone_mdt_weapons',
    'phone_mdt_offences',
    'phone_mdt_reports',
    'phone_mdt_report_charges',
    'phone_mdt_report_involved',
    'phone_mdt_report_restrictions',
    'phone_mdt_cases',
    'phone_mdt_case_officers',
    'phone_mdt_case_notes',
    'phone_mdt_case_reports',
    'phone_mdt_warrants',
    'phone_mdt_arrests',
    'phone_mdt_enforcement',
    'phone_mdt_bulletins',
    'phone_mdt_audit',
    'phone_mdt_protocols',
    'phone_mdt_medical',
}

---@type table[] The shipped treatment protocols, the medical terminal's counterpart to the penal
---code below. Same INSERT IGNORE contract: a protocol edited in-app survives a restart, a protocol
---added in a later release still lands. code, label, category, priority, description, body.
local PROTOCOLS = {
    { 'TP 101', 'Primary Survey', 'assessment', 'immediate', 'Airway, breathing, circulation, disability, exposure, in that order.',
      'Establish scene safety before approach. Check responsiveness, then airway patency with cervical spine control where trauma is suspected. Assess breathing rate and effort, then circulation by central and peripheral pulse. Record a baseline set of observations before any intervention that is not immediately life saving.' },
    { 'TP 102', 'Catastrophic Haemorrhage', 'trauma', 'immediate', 'Control life threatening bleeding before anything else.',
      'Direct pressure first. Escalate to a pressure dressing, then to a tourniquet placed high and tight on the affected limb. Record the time the tourniquet went on and hand that time over verbally; it decides what the receiving team can still save.' },
    { 'TP 103', 'Airway Obstruction', 'airway', 'immediate', 'Clear and maintain a patent airway.',
      'Encourage coughing while the patient can. On a failing cough, alternate five back blows with five abdominal thrusts. On unresponsiveness, begin chest compressions and inspect the airway on each ventilation attempt.' },
    { 'TP 104', 'Cardiac Arrest', 'cardiac', 'immediate', 'Compressions, early defibrillation, minimal interruption.',
      'Begin compressions at 100 to 120 per minute to a depth of 5 to 6cm. Apply the defibrillator as soon as it is to hand and follow its rhythm analysis. Rotate the compressor every two minutes. Do not stop to move the patient until there is return of circulation or the resuscitation is called.' },
    { 'TP 105', 'Chest Pain', 'cardiac', 'urgent', 'Treat as cardiac until it is ruled out.',
      'Sit the patient upright and keep them still. Record observations at first contact and every five minutes. Any pain radiating to jaw or left arm, or accompanied by sweating, nausea or breathlessness, travels as an emergency regardless of how well the patient looks.' },
    { 'TP 106', 'Anaphylaxis', 'medical', 'immediate', 'Adrenaline first, and early.',
      'Remove the trigger where it can be removed. Give adrenaline into the outer thigh without waiting for the airway to close. Lay the patient flat with legs raised unless breathing is compromised, in which case sit them up. Repeat after five minutes if there is no improvement.' },
    { 'TP 107', 'Opioid Overdose', 'medical', 'immediate', 'Support ventilation, then reverse.',
      'Respiratory failure is what kills, so ventilate before anything else. Give naloxone once ventilation is supported and titrate to breathing rather than to consciousness. Expect the reversal to wear off before the opioid does, and never leave the patient unattended after it.' },
    { 'TP 108', 'Major Haemorrhage', 'trauma', 'immediate', 'Stop the bleeding, keep them warm, move early.',
      'Pressure and packing for compressible sites, pelvic binder for a suspected pelvic fracture, splint for long bone fractures. Keep the patient warm; a cold patient stops clotting. This is a load and go, not a stay and play.' },
    { 'TP 109', 'Spinal Immobilisation', 'trauma', 'urgent', 'Immobilise on mechanism, not on symptoms.',
      'Manual in line stabilisation from first contact. Apply a collar sized to the patient and move with a scoop or long board. A patient who is walking on arrival may still have an unstable spine; the mechanism of injury decides this, not how they present.' },
    { 'TP 110', 'Burns', 'trauma', 'urgent', 'Cool the burn, warm the patient.',
      'Irrigate with cool running water for twenty minutes and no longer. Remove jewellery and constricting clothing early, before swelling sets in. Cover with a clean non adherent dressing. Estimate the surface area involved and pass that figure on; it decides the receiving unit.' },
    { 'TP 111', 'Seizure', 'medical', 'urgent', 'Protect from harm, time it, do not restrain.',
      'Clear the space around the patient and cushion the head. Time the seizure from first movement. Never place anything in the mouth. A seizure past five minutes, or a second seizure without recovery in between, is an emergency in its own right.' },
    { 'TP 112', 'Hypoglycaemia', 'medical', 'urgent', 'Sugar by the safest available route.',
      'Oral glucose for a patient who can protect their own airway. For a patient who cannot, use the parenteral route. Re-test after ten minutes and feed a longer acting carbohydrate once the patient is alert, or they will simply drop again.' },
    { 'TP 113', 'Drowning', 'medical', 'immediate', 'Ventilate first; this arrest is hypoxic.',
      'Give five rescue breaths before compressions, because the cause is oxygen and not rhythm. Assume spinal injury on any dive or fall. Remove wet clothing and insulate the patient early; hypothermia follows immersion faster than it is expected to.' },
    { 'TP 114', 'Obstetric Emergency', 'medical', 'immediate', 'Two patients, one of whom cannot be assessed.',
      'Position the mother on her left side to take the weight off the vena cava. If delivery is imminent, prepare for it where you stand rather than moving. Keep the newborn warm and dry and record the time of birth. Any bleeding in pregnancy travels as an emergency.' },
    { 'TP 115', 'Psychiatric Crisis', 'medical', 'routine', 'Scene safety, then rapport, then assessment.',
      'Do not enter alone where there is a weapon or a threat of one. Keep an exit behind you. Speak plainly and do not argue with a delusion. Rule out the physical causes that mimic a crisis, low blood sugar and hypoxia among them, before recording it as psychiatric.' },
    { 'TP 116', 'Death on Scene', 'admin', 'routine', 'Recognition of life extinct and what follows it.',
      'Resuscitation is not begun where injuries are incompatible with life or where rigor is established. Record the time of recognition, disturb the scene as little as possible, and hand the location over to police. The report for this carries the Death type.' },
    { 'TP 117', 'Refusal of Treatment', 'admin', 'routine', 'A competent adult may refuse, and that refusal is recorded.',
      'Establish that the patient has capacity for this decision at this time. Explain the risks in plain language and record that you did. Advise them to call again if anything changes. Document the refusal in a Patient Care report; the report is the protection for both sides.' },
    { 'TP 118', 'Handover', 'admin', 'routine', 'The structured handover the receiving team expects.',
      'Age and presenting complaint, mechanism or history, the observations recorded and the trend across them, treatment given and the response to it, and anything outstanding. Deliver it once, to the person taking over, and file the report before going back on the road.' },
}



---Creates every MDT table and seeds the penal code. Run once at boot, in dependency order so the
---foreign keys below always find their parent.
function schema.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_refs (
            `kind`    VARCHAR(16)  NOT NULL,
            `counter` INT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (`kind`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_refs')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_profiles (
            `citizenid`   VARCHAR(64)  NOT NULL,
            `fullname`    VARCHAR(96)  NOT NULL,
            `callsign`    VARCHAR(16)  NULL,
            `badge`       VARCHAR(16)  NULL,
            `radio`       VARCHAR(16)  NULL,
            `department`  VARCHAR(64)  NOT NULL DEFAULT '',
            `rank_label`  VARCHAR(64)  NOT NULL DEFAULT '',
            `grade_level` INT          NOT NULL DEFAULT 0,
            `avatar`      VARCHAR(512) NULL,
            `notes`       TEXT         NULL,
            `created_at`  INT          NOT NULL,
            `updated_at`  INT          NOT NULL,
            PRIMARY KEY (`citizenid`),
            UNIQUE KEY uniq_callsign (`callsign`),
            KEY idx_department (`department`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_profiles')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_profile_sessions (
            `id`        INT         NOT NULL AUTO_INCREMENT,
            `citizenid` VARCHAR(64) NOT NULL,
            `login_at`  INT         NOT NULL,
            `logout_at` INT         NULL,
            PRIMARY KEY (`id`),
            KEY idx_cid (`citizenid`),
            KEY idx_open (`citizenid`, `logout_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_profile_sessions')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_person_records (
            `citizenid`  VARCHAR(64)  NOT NULL,
            `notes`      TEXT         NULL,
            `flags`      TEXT         NULL,
            `mugshot`    VARCHAR(512) NULL,
            `updated_by` VARCHAR(64)  NULL,
            `updated_at` INT          NOT NULL,
            PRIMARY KEY (`citizenid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_person_records')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_vehicles (
            `plate`      VARCHAR(16)  NOT NULL,
            `notes`      TEXT         NULL,
            `points`     INT          NOT NULL DEFAULT 0,
            `status`     VARCHAR(16)  NOT NULL DEFAULT 'valid',
            `stolen`     TINYINT(1)   NOT NULL DEFAULT 0,
            `bolo`       TINYINT(1)   NOT NULL DEFAULT 0,
            `image`      VARCHAR(512) NULL,
            `updated_by` VARCHAR(64)  NULL,
            `updated_at` INT          NOT NULL,
            PRIMARY KEY (`plate`),
            KEY idx_flags (`stolen`, `bolo`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_vehicles')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_weapons (
            `serial`        VARCHAR(32) NOT NULL,
            `name`          VARCHAR(96) NOT NULL,
            `class`         VARCHAR(16) NOT NULL DEFAULT 'other',
            `owner`         VARCHAR(64) NULL,
            `owner_name`    VARCHAR(96) NULL,
            `status`        VARCHAR(16) NOT NULL DEFAULT 'registered',
            `bolo`          TINYINT(1)  NOT NULL DEFAULT 0,
            `ballistics`    TINYINT(1)  NOT NULL DEFAULT 0,
            `notes`         TEXT        NULL,
            `registered_by` VARCHAR(64) NULL,
            `registered_at` INT         NOT NULL,
            `updated_by`    VARCHAR(64) NULL,
            `updated_at`    INT         NOT NULL,
            PRIMARY KEY (`serial`),
            KEY idx_owner (`owner`, `registered_at`),
            KEY idx_status (`status`, `registered_at`),
            KEY idx_filed (`registered_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_weapons')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_reports (
            `id`              INT          NOT NULL AUTO_INCREMENT,
            `ref`             VARCHAR(16)  NOT NULL,
            `title`           VARCHAR(160) NOT NULL,
            `type`            VARCHAR(32)  NOT NULL,
            `body`            MEDIUMTEXT   NULL,
            `evidence`        MEDIUMTEXT   NULL,
            `author_cid`      VARCHAR(64)  NOT NULL,
            `author_name`     VARCHAR(96)  NOT NULL,
            `author_callsign` VARCHAR(16)  NULL,
            `department`      VARCHAR(64)  NOT NULL DEFAULT '',
            `domain`          VARCHAR(8)   NOT NULL DEFAULT 'leo',
            `created_at`      INT          NOT NULL,
            `updated_at`      INT          NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_ref (`ref`),
            KEY idx_created (`created_at`),
            KEY idx_type (`type`),
            KEY idx_domain (`domain`),
            KEY idx_author (`author_cid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_reports')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_report_charges (
            `id`        INT          NOT NULL AUTO_INCREMENT,
            `report_id` INT          NOT NULL,
            `citizenid` VARCHAR(64)  NOT NULL,
            `code`      VARCHAR(16)  NOT NULL,
            `label`     VARCHAR(120) NOT NULL,
            `class`     VARCHAR(16)  NOT NULL,
            `count`     INT UNSIGNED NOT NULL DEFAULT 1,
            `months`    INT UNSIGNED NOT NULL DEFAULT 0,
            `fine`      INT UNSIGNED NOT NULL DEFAULT 0,
            `expunged`  TINYINT(1)   NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`),
            KEY idx_report (`report_id`),
            KEY idx_cid (`citizenid`, `expunged`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_report_charges')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_report_involved (
            `id`        INT          NOT NULL AUTO_INCREMENT,
            `report_id` INT          NOT NULL,
            `citizenid` VARCHAR(64)  NOT NULL,
            `role`      VARCHAR(16)  NOT NULL,
            `notes`     VARCHAR(255) NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_party (`report_id`, `citizenid`, `role`),
            KEY idx_cid (`citizenid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_report_involved')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_report_restrictions (
            `id`         INT         NOT NULL AUTO_INCREMENT,
            `report_id`  INT         NOT NULL,
            `type`       VARCHAR(16) NOT NULL,
            `identifier` VARCHAR(64) NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_rule (`report_id`, `type`, `identifier`),
            KEY idx_ident (`type`, `identifier`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_report_restrictions')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_cases (
            `id`           INT          NOT NULL AUTO_INCREMENT,
            `ref`          VARCHAR(16)  NOT NULL,
            `title`        VARCHAR(160) NOT NULL,
            `summary`      TEXT         NULL,
            `evidence`     MEDIUMTEXT   NULL,
            `status`       VARCHAR(16)  NOT NULL DEFAULT 'open',
            `priority`     VARCHAR(16)  NOT NULL DEFAULT 'medium',
            `department`   VARCHAR(64)  NOT NULL DEFAULT '',
            `created_cid`  VARCHAR(64)  NOT NULL,
            `created_name` VARCHAR(96)  NOT NULL,
            `created_at`   INT          NOT NULL,
            `updated_at`   INT          NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_ref (`ref`),
            KEY idx_status (`status`),
            KEY idx_updated (`updated_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_cases')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_case_officers (
            `id`          INT         NOT NULL AUTO_INCREMENT,
            `case_id`     INT         NOT NULL,
            `citizenid`   VARCHAR(64) NOT NULL,
            `role`        VARCHAR(16) NOT NULL DEFAULT 'assisting',
            `assigned_by` VARCHAR(64) NULL,
            `assigned_at` INT         NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_officer (`case_id`, `citizenid`),
            KEY idx_cid (`citizenid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_case_officers')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_case_notes (
            `id`          INT         NOT NULL AUTO_INCREMENT,
            `case_id`     INT         NOT NULL,
            `author_cid`  VARCHAR(64) NOT NULL,
            `author_name` VARCHAR(96) NOT NULL,
            `body`        TEXT        NOT NULL,
            `created_at`  INT         NOT NULL,
            PRIMARY KEY (`id`),
            KEY idx_case (`case_id`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_case_notes')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_case_reports (
            `id`        INT NOT NULL AUTO_INCREMENT,
            `case_id`   INT NOT NULL,
            `report_id` INT NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_link (`case_id`, `report_id`),
            KEY idx_report (`report_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_case_reports')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_warrants (
            `id`              INT          NOT NULL AUTO_INCREMENT,
            `ref`             VARCHAR(16)  NOT NULL,
            `citizenid`       VARCHAR(64)  NOT NULL,
            `subject_name`    VARCHAR(96)  NOT NULL DEFAULT '',
            `report_id`       INT          NULL,
            `report_ref`      VARCHAR(16)  NULL,
            `charges`         TEXT         NULL,
            `felonies`        INT UNSIGNED NOT NULL DEFAULT 0,
            `misdemeanors`    INT UNSIGNED NOT NULL DEFAULT 0,
            `infractions`     INT UNSIGNED NOT NULL DEFAULT 0,
            `bond`            INT UNSIGNED NOT NULL DEFAULT 0,
            `issued_cid`      VARCHAR(64)  NOT NULL,
            `issued_name`     VARCHAR(96)  NOT NULL DEFAULT '',
            `issued_callsign` VARCHAR(16)  NULL,
            `department`      VARCHAR(64)  NOT NULL DEFAULT '',
            `issued_at`       INT          NOT NULL,
            `expiry`          INT          NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_ref (`ref`),
            KEY idx_subject (`citizenid`, `expiry`),
            KEY idx_expiry (`expiry`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_warrants')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_arrests (
            `id`               INT          NOT NULL AUTO_INCREMENT,
            `ref`              VARCHAR(16)  NOT NULL,
            `report_id`        INT          NULL,
            `report_ref`       VARCHAR(16)  NULL,
            `citizenid`        VARCHAR(64)  NOT NULL,
            `subject_name`     VARCHAR(96)  NOT NULL DEFAULT '',
            `officer_cid`      VARCHAR(64)  NOT NULL,
            `officer_name`     VARCHAR(96)  NOT NULL DEFAULT '',
            `officer_callsign` VARCHAR(16)  NULL,
            `charges`          TEXT         NULL,
            `months`           INT UNSIGNED NOT NULL DEFAULT 0,
            `fine`             INT UNSIGNED NOT NULL DEFAULT 0,
            `jailed`           TINYINT(1)   NOT NULL DEFAULT 0,
            `fined`            TINYINT(1)   NOT NULL DEFAULT 0,
            `created_at`       INT          NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_ref (`ref`),
            KEY idx_cid (`citizenid`),
            KEY idx_created (`created_at`),
            KEY idx_officer (`officer_cid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_arrests')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_enforcement (
            `report_ref` VARCHAR(16) NOT NULL,
            `citizenid`  VARCHAR(64) NOT NULL,
            `jailed`     TINYINT(1)  NOT NULL DEFAULT 0,
            `fined`      TINYINT(1)  NOT NULL DEFAULT 0,
            `arrest_ref` VARCHAR(16) NULL,
            `updated_at` INT         NOT NULL,
            PRIMARY KEY (`report_ref`, `citizenid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_enforcement')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_bulletins (
            `id`              INT          NOT NULL AUTO_INCREMENT,
            `title`           VARCHAR(120) NOT NULL,
            `body`            TEXT         NOT NULL,
            `author_cid`      VARCHAR(64)  NOT NULL,
            `author_name`     VARCHAR(96)  NOT NULL DEFAULT '',
            `author_callsign` VARCHAR(16)  NULL,
            `department`      VARCHAR(64)  NOT NULL DEFAULT '',
            `created_at`      INT          NOT NULL,
            `updated_at`      INT          NOT NULL,
            PRIMARY KEY (`id`),
            KEY idx_created (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_bulletins')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_audit (
            `id`             INT         NOT NULL AUTO_INCREMENT,
            `actor_cid`      VARCHAR(64) NOT NULL,
            `actor_name`     VARCHAR(96) NOT NULL DEFAULT '',
            `actor_callsign` VARCHAR(16) NULL,
            `department`     VARCHAR(64) NOT NULL DEFAULT '',
            `action`         VARCHAR(48) NOT NULL,
            `entity_type`    VARCHAR(32) NULL,
            `entity_id`      VARCHAR(64) NULL,
            `details`        TEXT        NULL,
            `created_at`     INT         NOT NULL,
            PRIMARY KEY (`id`),
            KEY idx_actor (`actor_cid`),
            KEY idx_entity (`entity_type`, `entity_id`),
            KEY idx_created (`created_at`),
            KEY idx_action (`action`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_audit')

    -- One medical file per citizen, written by the medical terminal and readable by nothing else.
    -- Deliberately NOT part of phone_mdt_person_records: that row is the police sheet, and a
    -- shared table would put an officer one query away from a patient's history.
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_medical (
            `citizenid`   VARCHAR(64)  NOT NULL,
            `blood_type`  VARCHAR(8)   NOT NULL DEFAULT '',
            `allergies`   VARCHAR(512) NOT NULL DEFAULT '',
            `conditions`  VARCHAR(512) NOT NULL DEFAULT '',
            `medications` VARCHAR(512) NOT NULL DEFAULT '',
            `notes`       MEDIUMTEXT   NULL,
            `dnr`         TINYINT(1)   NOT NULL DEFAULT 0,
            `updated_by`  VARCHAR(96)  NOT NULL DEFAULT '',
            `updated_at`  INT          NOT NULL DEFAULT 0,
            PRIMARY KEY (`citizenid`),
            KEY idx_updated (`updated_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_medical')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_protocols (
            `code`        VARCHAR(16)  NOT NULL,
            `label`       VARCHAR(120) NOT NULL,
            `category`    VARCHAR(24)  NOT NULL,
            `priority`    VARCHAR(16)  NOT NULL DEFAULT 'routine',
            `description` VARCHAR(255) NOT NULL DEFAULT '',
            `body`        MEDIUMTEXT   NULL,
            PRIMARY KEY (`code`),
            KEY idx_category (`category`),
            KEY idx_label (`label`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_protocols')

    do
        local i = 1
        while i <= #PROTOCOLS do
            local last = math.min(i + 24, #PROTOCOLS)
            local marks, args = {}, {}
            for n = i, last do
                local p = PROTOCOLS[n]
                marks[#marks + 1] = '(?, ?, ?, ?, ?, ?)'
                args[#args + 1] = p[1]
                args[#args + 1] = p[2]
                args[#args + 1] = p[3]
                args[#args + 1] = p[4]
                args[#args + 1] = p[5]
                args[#args + 1] = p[6]
            end
            MySQL.query.await(
                'INSERT IGNORE INTO phone_mdt_protocols (`code`, `label`, `category`, `priority`, `description`, `body`) VALUES '
                    .. table.concat(marks, ', '),
                args)
            i = last + 1
        end
    end

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_ia_cases (
            `id`            INT          NOT NULL AUTO_INCREMENT,
            `ref`           VARCHAR(16)  NOT NULL,
            `subject_cid`   VARCHAR(64)  NOT NULL,
            `subject_name`  VARCHAR(96)  NOT NULL DEFAULT '',
            `subject_rank`  VARCHAR(64)  NOT NULL DEFAULT '',
            `category`      VARCHAR(24)  NOT NULL DEFAULT 'misconduct',
            `title`         VARCHAR(160) NOT NULL,
            `summary`       TEXT         NULL,
            `evidence`      MEDIUMTEXT   NULL,
            `status`        VARCHAR(16)  NOT NULL DEFAULT 'open',
            `severity`      VARCHAR(16)  NOT NULL DEFAULT 'medium',
            `disposition`   VARCHAR(24)  NULL,
            `discipline`    VARCHAR(24)  NULL,
            `finding`       TEXT         NULL,
            `department`    VARCHAR(64)  NOT NULL DEFAULT '',
            `filed_cid`     VARCHAR(64)  NOT NULL,
            `filed_name`    VARCHAR(96)  NOT NULL,
            `assigned_cid`  VARCHAR(64)  NULL,
            `assigned_name` VARCHAR(96)  NULL,
            `created_at`    INT          NOT NULL,
            `updated_at`    INT          NOT NULL,
            `closed_at`     INT          NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_ref (`ref`),
            KEY idx_subject (`subject_cid`, `created_at`),
            KEY idx_status (`status`, `updated_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_ia_cases')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_ia_notes (
            `id`          INT         NOT NULL AUTO_INCREMENT,
            `ia_id`       INT         NOT NULL,
            `author_cid`  VARCHAR(64) NOT NULL,
            `author_name` VARCHAR(96) NOT NULL,
            `body`        TEXT        NOT NULL,
            `created_at`  INT         NOT NULL,
            PRIMARY KEY (`id`),
            KEY idx_case (`ia_id`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_ia_notes')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_court_cases (
            `id`              INT          NOT NULL AUTO_INCREMENT,
            `ref`             VARCHAR(16)  NOT NULL,
            `title`           VARCHAR(160) NOT NULL,
            `citizenid`       VARCHAR(64)  NOT NULL,
            `defendant_name`  VARCHAR(96)  NOT NULL DEFAULT '',
            `report_ref`      VARCHAR(16)  NULL,
            `charges`         MEDIUMTEXT   NULL,
            `summary`         TEXT         NULL,
            `evidence`        MEDIUMTEXT   NULL,
            `status`          VARCHAR(16)  NOT NULL DEFAULT 'filed',
            `plea`            VARCHAR(16)  NULL,
            `hearing_at`      INT          NULL,
            `judge_cid`       VARCHAR(64)  NULL,
            `judge_name`      VARCHAR(96)  NULL,
            `prosecutor_cid`  VARCHAR(64)  NULL,
            `prosecutor_name` VARCHAR(96)  NULL,
            `defence_cid`     VARCHAR(64)  NULL,
            `defence_name`    VARCHAR(96)  NULL,
            `verdict`         VARCHAR(16)  NULL,
            `sentence_months` INT UNSIGNED NOT NULL DEFAULT 0,
            `sentence_fine`   INT UNSIGNED NOT NULL DEFAULT 0,
            `ruling`          TEXT         NULL,
            `filed_cid`       VARCHAR(64)  NOT NULL,
            `filed_name`      VARCHAR(96)  NOT NULL,
            `created_at`      INT          NOT NULL,
            `updated_at`      INT          NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_ref (`ref`),
            KEY idx_defendant (`citizenid`, `created_at`),
            KEY idx_status (`status`, `hearing_at`),
            KEY idx_updated (`updated_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_court_cases')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_court_notes (
            `id`          INT         NOT NULL AUTO_INCREMENT,
            `court_id`    INT         NOT NULL,
            `author_cid`  VARCHAR(64) NOT NULL,
            `author_name` VARCHAR(96) NOT NULL,
            `kind`        VARCHAR(16) NOT NULL DEFAULT 'note',
            `body`        TEXT        NOT NULL,
            `created_at`  INT         NOT NULL,
            PRIMARY KEY (`id`),
            KEY idx_case (`court_id`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_court_notes')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_expungements (
            `id`           INT          NOT NULL AUTO_INCREMENT,
            `ref`          VARCHAR(16)  NOT NULL,
            `citizenid`    VARCHAR(64)  NOT NULL,
            `subject_name` VARCHAR(96)  NOT NULL DEFAULT '',
            `scope`        MEDIUMTEXT   NULL,
            `reason`       TEXT         NULL,
            `status`       VARCHAR(16)  NOT NULL DEFAULT 'pending',
            `ruling`       TEXT         NULL,
            `filed_cid`    VARCHAR(64)  NOT NULL,
            `filed_name`   VARCHAR(96)  NOT NULL,
            `ruled_cid`    VARCHAR(64)  NULL,
            `ruled_name`   VARCHAR(96)  NULL,
            `charges_cleared` INT UNSIGNED NOT NULL DEFAULT 0,
            `created_at`   INT          NOT NULL,
            `updated_at`   INT          NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY uniq_ref (`ref`),
            KEY idx_subject (`citizenid`, `created_at`),
            KEY idx_status (`status`, `updated_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_expungements')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mdt_bodycam_recs (
            `id`           INT          NOT NULL AUTO_INCREMENT,
            `camera_id`    VARCHAR(96)  NOT NULL,
            `kind`         VARCHAR(16)  NOT NULL DEFAULT 'bodycam',
            `officer_cid`  VARCHAR(64)  NOT NULL,
            `officer_name` VARCHAR(96)  NOT NULL DEFAULT '',
            `callsign`     VARCHAR(16)  NULL,
            `plate`        VARCHAR(16)  NULL,
            `model`        VARCHAR(64)  NULL,
            `watcher_cid`  VARCHAR(64)  NOT NULL,
            `watcher_name` VARCHAR(96)  NOT NULL DEFAULT '',
            `url`          VARCHAR(512) NOT NULL,
            `mime`         VARCHAR(64)  NOT NULL DEFAULT 'video/webm',
            `duration`     INT          NOT NULL DEFAULT 0,
            `bytes`        INT UNSIGNED NOT NULL DEFAULT 0,
            `shared_by`    VARCHAR(96)  NULL,
            `created_at`   INT          NOT NULL,
            PRIMARY KEY (`id`),
            KEY idx_watcher (`watcher_cid`, `created_at`),
            KEY idx_officer (`officer_cid`, `created_at`),
            KEY idx_created (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_mdt_bodycam_recs')

    -- Added after the table shipped, so an install that already has it gains the column rather
    -- than needing manual SQL.
    util.ensureColumns('phone_mdt_bodycam_recs', {
        shared_by = '`shared_by` VARCHAR(96) NULL',
    })

    -- Referential integrity, added on boot so a later install migrates with no manual SQL. Each
    -- call is a no-op once present, orphans are cleared first, and a type or collation mismatch is
    -- logged and skipped rather than being fatal.
    util.ensureForeignKey('phone_mdt_profile_sessions', 'citizenid', 'phone_mdt_profiles', 'citizenid', 'fk_mdt_sessions_profile')
    util.ensureForeignKey('phone_mdt_report_charges', 'report_id', 'phone_mdt_reports', 'id', 'fk_mdt_charges_report')
    util.ensureForeignKey('phone_mdt_report_involved', 'report_id', 'phone_mdt_reports', 'id', 'fk_mdt_involved_report')
    util.ensureForeignKey('phone_mdt_report_restrictions', 'report_id', 'phone_mdt_reports', 'id', 'fk_mdt_restrictions_report')
    util.ensureForeignKey('phone_mdt_case_officers', 'case_id', 'phone_mdt_cases', 'id', 'fk_mdt_case_officers_case')
    util.ensureForeignKey('phone_mdt_case_notes', 'case_id', 'phone_mdt_cases', 'id', 'fk_mdt_case_notes_case')
    util.ensureForeignKey('phone_mdt_case_reports', 'case_id', 'phone_mdt_cases', 'id', 'fk_mdt_case_reports_case')
    util.ensureForeignKey('phone_mdt_case_reports', 'report_id', 'phone_mdt_reports', 'id', 'fk_mdt_case_reports_report')
    util.ensureForeignKey('phone_mdt_ia_notes', 'ia_id', 'phone_mdt_ia_cases', 'id', 'fk_mdt_ia_notes_case')
    util.ensureForeignKey('phone_mdt_court_notes', 'court_id', 'phone_mdt_court_cases', 'id', 'fk_mdt_court_notes_case')

    -- The handset reader pages a citizen's whole history newest-first, which the phone app itself
    -- never does. Without the sort column in the index that is a filesort of every row the citizen
    -- owns, per page: a heavy caller measured over a second for thirty rows.
    util.ensureIndex('phone_calls', 'idx_phone_calls_cid_at', '(citizenid, called_at)')
    util.ensureIndex('phone_voice_memos', 'idx_voice_memos_cid_at', '(citizenid, created_at)')
end

return schema
