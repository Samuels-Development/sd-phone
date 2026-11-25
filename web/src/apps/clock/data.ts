import { t } from '@/i18n';

export interface WorldCity {
    id:       string;
    city:     string;
    region:   string;
    timezone: string;
}

export const WORLD_CITIES: WorldCity[] = [
    { id: 'new-york',    city: 'New York',      region: 'United States', timezone: 'America/New_York'    },
    { id: 'london',      city: 'London',        region: 'United Kingdom',timezone: 'Europe/London'       },
    { id: 'paris',       city: 'Paris',         region: 'France',        timezone: 'Europe/Paris'        },
    { id: 'tokyo',       city: 'Tokyo',         region: 'Japan',         timezone: 'Asia/Tokyo'          },
    { id: 'sydney',      city: 'Sydney',        region: 'Australia',     timezone: 'Australia/Sydney'    },
    { id: 'los-angeles', city: 'Los Angeles',  region: 'United States', timezone: 'America/Los_Angeles' },
    { id: 'denver',      city: 'Denver',        region: 'United States', timezone: 'America/Denver'      },
    { id: 'chicago',     city: 'Chicago',       region: 'United States', timezone: 'America/Chicago'     },
    { id: 'sao-paulo',   city: 'São Paulo',     region: 'Brazil',        timezone: 'America/Sao_Paulo'   },
    { id: 'dubai',       city: 'Dubai',         region: 'UAE',           timezone: 'Asia/Dubai'          },
    { id: 'mumbai',      city: 'Mumbai',        region: 'India',         timezone: 'Asia/Kolkata'        },
    { id: 'bangkok',     city: 'Bangkok',       region: 'Thailand',      timezone: 'Asia/Bangkok'        },
    { id: 'hong-kong',   city: 'Hong Kong',     region: 'China',         timezone: 'Asia/Hong_Kong'      },
];

export interface AlarmDef {
    id:      string;
    hour:    number;
    minute:  number;
    label:   string;
    days:    string;
    enabled: boolean;
    sound?:      boolean;
    snooze?:     boolean;
    snoozeSecs?: number;
}

export const isRepeating = (a: AlarmDef) => !!a.days;

export const DEFAULT_ALARMS: AlarmDef[] = [
    { id: 'a1', hour: 6,  minute: 30, label: 'Wake Up',  days: '', enabled: true  },
    { id: 'a2', hour: 8,  minute: 0,  label: 'Alarm',    days: '', enabled: false },
    { id: 'a3', hour: 12, minute: 0,  label: 'Lunch',    days: '', enabled: false },
    { id: 'a4', hour: 22, minute: 30, label: 'Bedtime',  days: '', enabled: true  },
];

export const TIMER_PRESETS: Array<{ label: string; seconds: number }> = [
    { label: '3 minutes',     seconds: 180  },
    { label: '5 minutes',     seconds: 300  },
    { label: '10 minutes',    seconds: 600  },
    { label: '20 minutes',    seconds: 1200 },
    { label: '1 hour',        seconds: 3600 },
];


const ZONE_FORMATS = {
    clock:  { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true },
    hour:   { hour: 'numeric', hour12: false },
    day:    { day: 'numeric' },
    offset: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, day: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

type ZoneFormat = keyof typeof ZONE_FORMATS;

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

export function zoneFormatter(tz: string, kind: ZoneFormat): Intl.DateTimeFormat {
    const key = `${kind}|${tz}`;
    let fmt = zoneFormatters.get(key);
    if (!fmt) {
        fmt = new Intl.DateTimeFormat('en-US', { ...ZONE_FORMATS[kind], timeZone: tz });
        zoneFormatters.set(key, fmt);
    }
    return fmt;
}

export function getZoneTime(tz: string, now: Date = new Date()): {
    h12: number; minutes: number; seconds: number; ampm: 'AM' | 'PM'; hours24: number;
} {
    const parts = zoneFormatter(tz, 'clock').formatToParts(now);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    return {
        h12:    parseInt(get('hour')),
        minutes:parseInt(get('minute')),
        seconds:parseInt(get('second')),
        ampm:   get('dayPeriod').toUpperCase().includes('AM') ? 'AM' : 'PM',
        hours24: parseInt(zoneFormatter(tz, 'hour').format(now)),
    };
}

export function getOffsetLabel(tz: string, now: Date = new Date()): string {
    const localDay = now.getDate();
    const zoneDay = parseInt(zoneFormatter(tz, 'day').format(now));
    const localOffsetMin = -now.getTimezoneOffset();
    const zoneOffsetMin  = getZoneOffsetMinutes(tz, now);
    const diffH = (zoneOffsetMin - localOffsetMin) / 60;
    if (diffH === 0) return t('clock.localTime', 'Local time');

    const hrs    = Number.isInteger(diffH) ? `${diffH}` : diffH.toFixed(1).replace('.0', '');
    const signed = diffH > 0 ? `+${hrs}` : hrs;
    const dayDiff  = zoneDay - localDay;
    const dayLabel = dayDiff === 0 ? t('clock.today', 'Today') : dayDiff > 0 ? t('clock.tomorrow', 'Tomorrow') : t('clock.yesterday', 'Yesterday');
    return t('clock.offsetHrs', '{day} {signed}HRS', { day: dayLabel, signed });
}

function getZoneOffsetMinutes(tz: string, now: Date): number {
    const utcStr  = zoneFormatter('UTC', 'offset').format(now);
    const zoneStr = zoneFormatter(tz, 'offset').format(now);
    const parse = (s: string) => {
        const m = s.match(/(\d+)\/(\d+)\/\d+,?\s*(\d+):(\d+):(\d+)/);
        if (!m) return 0;
        return (parseInt(m[3]) * 60) + parseInt(m[4]);
    };
    return parse(zoneStr) - parse(utcStr);
}

export function fmtStopwatch(ms: number): { main: string; cents: string } {
    const totalCs = Math.floor(ms / 10);
    const cs = totalCs % 100;
    const totalS = Math.floor(totalCs / 100);
    const s  = totalS % 60;
    const m  = Math.floor(totalS / 60);
    return {
        main:  `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
        cents: String(cs).padStart(2,'0'),
    };
}

export function fmtTimer(totalSecs: number): string {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
}

export function fmtTimerLabel(totalSecs: number): string {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const parts: string[] = [];
    if (h) parts.push(t('clock.hrUnit', '{h} hr', { h }));
    if (m) parts.push(t('clock.minUnit', '{m} min', { m }));
    if (s) parts.push(t('clock.secUnit', '{s} sec', { s }));
    return parts.join(' ') || t('clock.zeroSec', '0 sec');
}
