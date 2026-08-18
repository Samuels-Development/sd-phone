-- Loaded for side effects, and FIRST: everything below and every module after it may call the
-- ox_lib string helpers this fills in on an older ox_lib.
require 'bridge.shared.oxcompat'
-- Loaded for side effects: framework detection runs once and hard-errors when no supported
-- framework is started.
require 'bridge.shared.framework'
-- Loaded for side effects: the locale boot thread loads locales/<config.Locale>.json.
require 'bridge.shared.locale'
