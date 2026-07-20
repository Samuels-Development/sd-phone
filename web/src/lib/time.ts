import { getLocaleTag, t } from '@/i18n';

export function relTimeCompact(from: number, opts: {
    now?:            number;
    nowLabel?:       string;
    yesterdayLabel?: string;
    dateAfterDays?:  number;
} = {}): string {
    const now = opts.now ?? Date.now();
    const secs = Math.max(0, Math.floor((now - from) / 1000));
    if (secs < 60) return opts.nowLabel ?? 'now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days === 1 && opts.yesterdayLabel) return opts.yesterdayLabel;
    if (opts.dateAfterDays !== undefined && days >= opts.dateAfterDays) {
        return new Date(from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    if (days < 7) return `${days}d`;
    return `${Math.floor(days / 7)}w`;
}

export function formatDuration(secs: number, opts: {
    padMinutes?: boolean;
    withHours?:  boolean;
} = {}): string {
    const total = !isFinite(secs) || secs < 0 ? 0 : Math.floor(secs);
    const ss = String(total % 60).padStart(2, '0');
    if (opts.withHours) {
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        return `${h}:${String(m).padStart(2, '0')}:${ss}`;
    }
    const m = Math.floor(total / 60);
    return `${opts.padMinutes ? String(m).padStart(2, '0') : m}:${ss}`;
}

export function format12h(hour: number, minute: number): string {
    const period = hour >= 12 ? t('time.pm', 'PM') : t('time.am', 'AM');
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:${String(minute).padStart(2, '0')} ${period}`;
}

export function formatListDate(ts: number | string | Date): string {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
    if (days <= 0) return format12h(d.getHours(), d.getMinutes());
    if (days === 1) return t('time.yesterday', 'Yesterday');
    if (days < 7) {
        return [
            t('time.sun', 'Sun'), t('time.mon', 'Mon'), t('time.tue', 'Tue'), t('time.wed', 'Wed'),
            t('time.thu', 'Thu'), t('time.fri', 'Fri'), t('time.sat', 'Sat'),
        ][d.getDay()];
    }
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

export function formatClockTime(date: Date, use24h: boolean): string {
    if (use24h) {
        return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }
    const h12 = date.getHours() % 12 || 12;
    return `${h12}:${pad2(date.getMinutes())}`;
}

export function formatLongDate(date: Date): string {
    return date.toLocaleDateString(getLocaleTag(), {
        weekday: 'long',
        month:   'long',
        day:     'numeric',
    });
}

/** Calendar date with the year, e.g. "May 21, 2026" - for stored dates far from today. */
export function formatMediumDate(ts: number | string | Date): string {
    const d = ts instanceof Date ? ts : new Date(typeof ts === 'number' ? ts * 1000 : ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(getLocaleTag(), {
        year:  'numeric',
        month: 'long',
        day:   'numeric',
    });
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}
