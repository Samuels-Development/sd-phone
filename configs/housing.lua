-- Homes app - lists the player's owned / rented properties from whatever
-- housing system is running. Read-only - the bridge never writes to another
-- resource's tables. Each system is read via its own adapter (server export
-- where one exists, otherwise a defensive DB query).
return {
    Enabled = true,

    -- 'auto' picks the first started resource from the list below. Override
    -- with an exact resource name if auto-detect guesses wrong.
    System  = 'auto',

    -- Checked in priority order when System = 'auto'; first `started` wins.
    -- qbx_properties stays last: Qbox starts it by default, often beside another housing script.
    Resources = {
        'qs-housing', 'ps-housing', 'vms_housing', 'rtx_housing',
        'origen_housing', 'bcs_housing', 'loaf_housing', 'tk_housing', 'RxHousing', 'LNS_Housing',
        'nolag_properties', 'kartik-properties', 'qbx_properties', 'ai-properties',
    },
}
