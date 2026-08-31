import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sunrise, Sunset } from 'lucide-react';

import { t } from '@/i18n';
import { fetchNui } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import type { WeatherPayload } from '@/core/types';
import {
    backgroundFor, buildForecast, formatHour, formatTimeOfDay, isDaytime,
    PROFILES, getWeatherLabel,
} from './data';
import type { WeatherCode } from './data';
import { WeatherIcon } from './WeatherIcon';

const SB_H = 54;

interface LiveWeather {
    current: WeatherCode;
    next:    WeatherCode;
    time?:   { hour: number; minute: number };
}

const KNOWN_CODES = new Set<WeatherCode>([
    'EXTRASUNNY','CLEAR','NEUTRAL','CLEARING','CLOUDS','SMOG','FOGGY',
    'OVERCAST','RAIN','THUNDER','SNOWLIGHT','SNOW','BLIZZARD','XMAS','HALLOWEEN',
]);

function asCode(s: string | undefined): WeatherCode | null {
    return s && KNOWN_CODES.has(s as WeatherCode) ? (s as WeatherCode) : null;
}

export function Weather({ onClose }: { onClose: () => void }) {
    const [live, setLive] = useState<LiveWeather | null>(null);
    const WEATHER_LABEL = getWeatherLabel();

    const applyWeather = useCallback((data?: WeatherPayload) => {
        const cur = asCode(data?.current);
        if (!cur) return;
        setLive({ current: cur, next: asCode(data!.next) ?? cur, time: data!.time });
    }, []);
    useNuiEvent('sd-phone:weather', applyWeather);
    useEffect(() => { void fetchNui<WeatherPayload>('sd-phone:weather:get').then(applyWeather); }, [applyWeather]);

    useStatusBarLight(true);

    const city = useMemo(
        () => buildForecast(PROFILES.find(p => p.id === 'los_santos')!, live ?? undefined),
        [live],
    );
    const day = isDaytime(city.nowTimeGame?.hour);
    const [bgTop, bgBottom] = backgroundFor(city.nowCode, day);
    const sunVisible = day && (city.nowCode === 'EXTRASUNNY' || city.nowCode === 'CLEAR');

    return (
        <div
            className="absolute inset-0 z-10 overflow-hidden text-white"
            style={{ background: `linear-gradient(180deg, ${bgTop} 0%, ${bgBottom} 100%)` }}
        >
            {sunVisible && <SunFlare />}

            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="overflow-y-auto no-scrollbar" style={{ height: `calc(100% - ${SB_H + 28}px)` }}>
                <div className="px-5 pt-16 text-center">
                    <div className="flex items-center justify-center gap-2 text-[20px] font-medium">
                        {city.label}
                        {city.isLive && (
                            <span className="rounded-full bg-ios-green/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                {t('weather.live', 'Live')}
                            </span>
                        )}
                    </div>
                    <div className="text-[12px] uppercase tracking-wider text-white/70">
                        {city.region}
                    </div>
                    {city.nowTimeGame && (
                        <div className="mt-0.5 text-[13px] font-medium tabular-nums text-white/85">
                            {formatTimeOfDay(city.nowTimeGame.hour * 60 + city.nowTimeGame.minute)}
                        </div>
                    )}
                    <div className="mt-1 flex items-start justify-center">
                        <span className="text-[88px] font-thin leading-none tabular-nums">
                            {city.nowTempF}
                        </span>
                        <span className="mt-3 text-[28px] font-thin">°</span>
                    </div>
                    <div className="text-[18px] font-medium">{WEATHER_LABEL[city.nowCode]}</div>
                    <div className="mt-1 text-[14px] text-white/80">
                        {t('weather.highLow', 'H:{high}° L:{low}°', { high: city.daily[0].high, low: city.daily[0].low })}
                    </div>
                </div>

                <Card>
                    <div className="border-b border-white/15 px-3.5 pb-2 pt-2.5 text-[12px] uppercase tracking-wider text-white/70">
                        {t('weather.next24Hours', 'Next 24 Hours')}
                    </div>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar px-3.5 py-4">
                        {city.hourly.map(h => (
                            <div key={h.offset} className="flex w-[50px] shrink-0 flex-col items-center gap-1.5">
                                <span className="text-[13px] text-white/80">{formatHour(h.offset, city.nowTimeGame?.hour)}</span>
                                <WeatherIcon code={h.code} className="h-[30px] w-[30px]" strokeWidth={1.8} />
                                <span className="text-[18px] font-medium tabular-nums">{h.tempF}°</span>
                            </div>
                        ))}
                    </div>
                </Card>

                <div className="grid grid-cols-2 gap-2 px-3 pb-6 pt-2">
                    <Tile label={t('weather.feelsLike', 'Feels Like')} value={`${city.feelsLikeF}°`} />
                    <Tile label={t('weather.humidity', 'Humidity')}   value={`${city.humidity}%`} />
                    <Tile label={t('weather.wind', 'Wind')}       value={t('weather.windMph', '{speed} mph', { speed: city.windMph })} />
                    <Tile label={t('weather.uvIndex', 'UV Index')}   value={`${city.uvIndex}`} />
                    <Tile
                        label={t('weather.sunrise', 'Sunrise')}
                        value={formatTimeOfDay(city.sunriseMin)}
                        icon={<Sunrise className="h-[18px] w-[18px]" strokeWidth={1.75} />}
                    />
                    <Tile
                        label={t('weather.sunset', 'Sunset')}
                        value={formatTimeOfDay(city.sunsetMin)}
                        icon={<Sunset className="h-[18px] w-[18px]" strokeWidth={1.75} />}
                    />
                </div>
            </div>

            <button
                type="button"
                onClick={onClose}
                aria-label={t('weather.closeWeather', 'Close Weather')}
                className="absolute inset-x-0 bottom-0 z-50 h-7 cursor-default"
            />
        </div>
    );
}

function SunFlare() {
    const cx = 34;
    const cy = 24;
    const ray = 620;
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div
                className="absolute rounded-full"
                style={{
                    right: cx - 320, top: cy - 320, width: 640, height: 640,
                    background: 'radial-gradient(circle, rgba(255,247,225,0.52) 0%, rgba(255,234,165,0.30) 24%, rgba(255,226,140,0.12) 46%, rgba(255,226,140,0) 68%)',
                }}
            />
            <div
                className="absolute"
                style={{
                    right: cx - ray / 2, top: cy - ray / 2, width: ray, height: ray,
                    background: 'repeating-conic-gradient(from 6deg at 50% 50%, rgba(255,249,224,0.30) 0deg 1.4deg, rgba(255,249,224,0) 1.4deg 11deg)',
                    WebkitMaskImage: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.95) 6%, rgba(0,0,0,0.55) 26%, rgba(0,0,0,0) 60%)',
                    maskImage: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.95) 6%, rgba(0,0,0,0.55) 26%, rgba(0,0,0,0) 60%)',
                }}
            />
            <div
                className="absolute rounded-full"
                style={{
                    right: cx - 84, top: cy - 84, width: 168, height: 168,
                    background: 'radial-gradient(circle, rgba(255,255,255,0.98) 0%, rgba(255,251,232,0.96) 26%, rgba(255,240,190,0.62) 50%, rgba(255,234,165,0) 78%)',
                }}
            />
            <div
                className="absolute rounded-full"
                style={{ right: cx - 40, top: cy - 40, width: 80, height: 80, background: 'radial-gradient(circle, #ffffff 0%, rgba(255,254,250,0.96) 42%, rgba(255,250,230,0) 80%)' }}
            />
            <div
                className="absolute"
                style={{
                    right: cx - 240, top: cy - 6, width: 460, height: 12, borderRadius: 9999,
                    background: 'linear-gradient(90deg, rgba(255,243,205,0) 0%, rgba(255,243,205,0.32) 52%, rgba(255,252,238,0.7) 86%, rgba(255,243,205,0) 100%)',
                    filter: 'blur(2px)',
                }}
            />
            <div className="absolute rounded-full" style={{ right: 150, top: 168, width: 18, height: 18, background: 'rgba(255,236,180,0.30)' }} />
            <div className="absolute rounded-full" style={{ right: 224, top: 246, width: 30, height: 30, background: 'rgba(190,214,255,0.14)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }} />
            <div className="absolute rounded-full" style={{ right: 312, top: 332, width: 13, height: 13, background: 'rgba(255,222,165,0.26)' }} />
        </div>
    );
}


function Card({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="mx-3 mt-3 overflow-hidden rounded-[14px] border"
            style={{ background: 'rgba(255,255,255,0.19)', borderColor: 'rgba(255,255,255,0.20)' }}
        >
            {children}
        </div>
    );
}

function Tile({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
    return (
        <div
            className="overflow-hidden rounded-[14px] border p-3"
            style={{ background: 'rgba(255,255,255,0.19)', borderColor: 'rgba(255,255,255,0.20)' }}
        >
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/70">
                {icon}
                <span>{label}</span>
            </div>
            <div className="mt-1 text-[24px] font-light tabular-nums">{value}</div>
        </div>
    );
}
