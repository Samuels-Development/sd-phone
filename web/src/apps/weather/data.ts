
import { t } from '@/i18n';
import { seededRandom } from '@/lib/random';
import { format12h } from '@/lib/time';

export type WeatherCode =
    | 'EXTRASUNNY' | 'CLEAR'  | 'NEUTRAL' | 'CLEARING'
    | 'CLOUDS'     | 'SMOG'   | 'FOGGY'   | 'OVERCAST'
    | 'RAIN'       | 'THUNDER'
    | 'SNOWLIGHT'  | 'SNOW'   | 'BLIZZARD'
    | 'XMAS'       | 'HALLOWEEN';

interface WeatherSlice {
    offset: number;
    code:   WeatherCode;
    tempF:  number;
}

export interface DayForecast {
    label: string;
    code:  WeatherCode;
    high:  number;
    low:   number;
}

export interface CityForecast {
    cityId:      string;
    label:       string;
    region:      string;
    isLive:      boolean;
    nowTimeGame?: { hour: number; minute: number };
    nowCode:     WeatherCode;
    nowTempF:    number;
    feelsLikeF:  number;
    humidity:    number;
    windMph:     number;
    uvIndex:     number;
    sunriseMin:  number;
    sunsetMin:   number;
    hourly:      WeatherSlice[];
    daily:       DayForecast[];
}


export function getWeatherLabel(): Record<WeatherCode, string> {
    return {
        EXTRASUNNY: t('weather.condSunny', 'Sunny'),
        CLEAR:      t('weather.condClear', 'Clear'),
        NEUTRAL:    t('weather.condFair', 'Fair'),
        CLEARING:   t('weather.condClearing', 'Clearing'),
        CLOUDS:     t('weather.condCloudy', 'Cloudy'),
        SMOG:       t('weather.condSmoggy', 'Smoggy'),
        FOGGY:      t('weather.condFoggy', 'Foggy'),
        OVERCAST:   t('weather.condOvercast', 'Overcast'),
        RAIN:       t('weather.condRain', 'Rain'),
        THUNDER:    t('weather.condThunderstorms', 'Thunderstorms'),
        SNOWLIGHT:  t('weather.condLightSnow', 'Light Snow'),
        SNOW:       t('weather.condSnow', 'Snow'),
        BLIZZARD:   t('weather.condBlizzard', 'Blizzard'),
        XMAS:       t('weather.condFestiveSnow', 'Festive Snow'),
        HALLOWEEN:  t('weather.condEerieMist', 'Eerie Mist'),
    };
}

export function backgroundFor(code: WeatherCode, isDay: boolean): [string, string] {
    if (!isDay) return ['#101d38', '#26344f'];
    switch (code) {
        case 'EXTRASUNNY': return ['#4a86b6', '#76a6cb'];
        case 'CLEAR':      return ['#4d82a8', '#76a1c2'];
        case 'NEUTRAL':
        case 'CLEARING':   return ['#5b7b98', '#849fb8'];
        case 'CLOUDS':
        case 'SMOG':       return ['#6a7682', '#87929e'];
        case 'FOGGY':      return ['#727c87', '#929ba6'];
        case 'OVERCAST':   return ['#555f69', '#6f7984'];
        case 'RAIN':       return ['#3f5060', '#566779'];
        case 'THUNDER':    return ['#313450', '#484b6a'];
        case 'SNOWLIGHT':
        case 'SNOW':       return ['#74899c', '#9aabba'];
        case 'BLIZZARD':   return ['#6c7886', '#929fac'];
        case 'XMAS':       return ['#52708a', '#86a3bc'];
        case 'HALLOWEEN':  return ['#3a2746', '#5d4373'];
    }
}


interface ClimateProfile {
    id:        string;
    label:     string;
    region:    string;
    baseTempF: number;
    variance:  number;
    pool:      WeatherCode[];
    sunrise:   number;
    sunset:    number;
}

export const PROFILES: ClimateProfile[] = [
    {
        id:        'los_santos',
        label:     'Los Santos',
        region:    'San Andreas',
        baseTempF: 78,
        variance:  10,
        pool:      ['EXTRASUNNY','EXTRASUNNY','CLEAR','CLEAR','CLOUDS','SMOG','OVERCAST','RAIN','THUNDER'],
        sunrise:   6 * 60 + 20,
        sunset:    19 * 60 + 40,
    },
    {
        id:        'vice_city',
        label:     'Vice City',
        region:    'Florida',
        baseTempF: 86,
        variance:  8,
        pool:      ['EXTRASUNNY','EXTRASUNNY','CLEAR','THUNDER','RAIN','CLOUDS'],
        sunrise:   6 * 60 + 35,
        sunset:    19 * 60 + 50,
    },
    {
        id:        'liberty_city',
        label:     'Liberty City',
        region:    'Northeast',
        baseTempF: 48,
        variance:  16,
        pool:      ['CLOUDS','OVERCAST','RAIN','RAIN','FOGGY','SNOWLIGHT','CLEAR'],
        sunrise:   7 * 60 + 5,
        sunset:    17 * 60 + 30,
    },
    {
        id:        'san_fierro',
        label:     'San Fierro',
        region:    'Bay Area',
        baseTempF: 62,
        variance:  9,
        pool:      ['FOGGY','FOGGY','CLEAR','CLOUDS','OVERCAST','RAIN'],
        sunrise:   6 * 60 + 50,
        sunset:    18 * 60 + 50,
    },
    {
        id:        'las_venturas',
        label:     'Las Venturas',
        region:    'Bone County',
        baseTempF: 96,
        variance:  10,
        pool:      ['EXTRASUNNY','EXTRASUNNY','EXTRASUNNY','CLEAR','CLOUDS','THUNDER'],
        sunrise:   6 * 60 + 10,
        sunset:    19 * 60 + 30,
    },
];


function seedFor(cityId: string): number {
    const day = Math.floor(Date.now() / 86_400_000);
    let h = day;
    for (let i = 0; i < cityId.length; i++) h = (h * 31 + cityId.charCodeAt(i)) >>> 0;
    return h;
}

function tempForCode(code: WeatherCode, base: number, variance: number, rnd: () => number): number {
    const offsets: Record<WeatherCode, number> = {
        EXTRASUNNY: +6, CLEAR: +3, NEUTRAL: +0, CLEARING: +1,
        CLOUDS: -2, SMOG: -1, FOGGY: -3, OVERCAST: -4,
        RAIN: -5, THUNDER: -3,
        SNOWLIGHT: -30, SNOW: -40, BLIZZARD: -50,
        XMAS: -35, HALLOWEEN: -8,
    };
    return Math.round(base + offsets[code] + (rnd() - 0.5) * variance * 2);
}

export function buildForecast(
    profile: ClimateProfile,
    live?: { current: WeatherCode; next: WeatherCode; time?: { hour: number; minute: number } },
): CityForecast {
    const rnd = seededRandom(seedFor(profile.id));
    const baseHour = live?.time?.hour ?? new Date().getHours();

    const nowCode = live?.current ?? profile.pool[Math.floor(rnd() * profile.pool.length)];
    const nextCode = live?.next   ?? profile.pool[Math.floor(rnd() * profile.pool.length)];
    const nowTempF = tempForCode(nowCode, profile.baseTempF, profile.variance, rnd);

    const hourly: WeatherSlice[] = [];
    for (let i = 0; i < 24; i++) {
        const code = i === 0 ? nowCode
                   : i === 1 ? nextCode
                   : profile.pool[Math.floor(rnd() * profile.pool.length)];
        const tempBase = tempForCode(code, profile.baseTempF, profile.variance, rnd);
        const hourOfDay = (baseHour + i) % 24;
        const diurnal   = Math.sin(((hourOfDay - 6) / 24) * Math.PI * 2) * 6;
        hourly.push({ offset: i * 60, code, tempF: Math.round(tempBase + diurnal) });
    }

    const todayTemps = hourly.slice(0, 24).map(h => h.tempF);
    const todayHigh  = Math.max(...todayTemps);
    const todayLow   = Math.min(...todayTemps);

    const dayLabels = [
        t('weather.daySun', 'Sun'), t('weather.dayMon', 'Mon'), t('weather.dayTue', 'Tue'),
        t('weather.dayWed', 'Wed'), t('weather.dayThu', 'Thu'), t('weather.dayFri', 'Fri'),
        t('weather.daySat', 'Sat'),
    ];
    const today = new Date().getDay();

    const daily: DayForecast[] = [];
    daily.push({ label: t('weather.today', 'Today'), code: nowCode, high: todayHigh, low: todayLow });
    for (let d = 1; d < 7; d++) {
        const code = profile.pool[Math.floor(rnd() * profile.pool.length)];
        const high = tempForCode(code, profile.baseTempF, profile.variance, rnd);
        const low  = high - 8 - Math.floor(rnd() * 8);
        daily.push({ label: dayLabels[(today + d) % 7], code, high, low });
    }

    return {
        cityId:      profile.id,
        label:       profile.label,
        region:      profile.region,
        isLive:      profile.id === 'los_santos' && !!live,
        nowTimeGame: live?.time,
        nowCode,
        nowTempF,
        feelsLikeF:  Math.round(nowTempF + (rnd() - 0.5) * 6),
        humidity:    Math.round(40 + rnd() * 50),
        windMph:     Math.round(2 + rnd() * 12),
        uvIndex:     Math.max(0, Math.round(10 - (24 - hourly.length) - rnd() * 4)),
        sunriseMin:  profile.sunrise,
        sunsetMin:   profile.sunset,
        hourly,
        daily,
    };
}


export function isDaytime(hour?: number): boolean {
    const h = hour ?? new Date().getHours();
    return h >= 6 && h < 20;
}

export function formatHour(offsetMin: number, baseHour?: number): string {
    if (offsetMin === 0) return t('weather.now', 'Now');
    const h = baseHour !== undefined
        ? (baseHour + Math.round(offsetMin / 60)) % 24
        : new Date(Date.now() + offsetMin * 60_000).getHours();
    const p = h >= 12 ? t('time.pm', 'PM') : t('time.am', 'AM');
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12} ${p}`;
}

export function formatTimeOfDay(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return format12h(h, m);
}
