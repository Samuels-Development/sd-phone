import { t } from '@/i18n';

export function compactCount(n: number): string {
    if (n < 1000) return String(n);
    const unit = n < 1_000_000 ? 'K' : 'M';
    const base = n < 1_000_000 ? 1000 : 1_000_000;
    const scaled = Math.floor((n / base) * 10) / 10;
    const text = scaled >= 100 || Number.isInteger(scaled) ? String(Math.floor(scaled * 10) / 10) : scaled.toFixed(1);
    return `${trimZero(text)}${unit}`;
}

export function pollTimeLeft(endsAt: number, now: number = Date.now()): string {
    const secs = Math.floor((endsAt - now) / 1000);
    if (secs <= 0) return t('squawk.pollFinalResults', 'Final results');

    const days = Math.floor(secs / 86400);
    if (days === 1) return t('squawk.pollOneDayLeft', '1 day left');
    if (days > 1) return t('squawk.pollDaysLeft', '{n} days left', { n: days });
    const hours = Math.floor(secs / 3600);
    if (hours === 1) return t('squawk.pollOneHourLeft', '1 hour left');
    if (hours > 1) return t('squawk.pollHoursLeft', '{n} hours left', { n: hours });
    const mins = Math.floor(secs / 60);
    if (mins === 1) return t('squawk.pollOneMinuteLeft', '1 minute left');
    if (mins > 1) return t('squawk.pollMinutesLeft', '{n} minutes left', { n: mins });
    return t('squawk.pollLastMinute', 'Less than a minute left');
}

function trimZero(s: string): string {
    return s.endsWith('.0') ? s.slice(0, -2) : s;
}
