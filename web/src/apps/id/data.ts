import { t } from '@/i18n';
import type { IdCardData, IdCardKind } from '@/core/types';

export type { IdCardData, ReceivedIdCard } from '@/core/types';

export const CARD_RATIO = 1.586;

export function fieldLabel(key: string): string {
    switch (key) {
        case 'dob':         return t('id.fieldDob', 'Date of Birth');
        case 'sex':         return t('id.fieldSex', 'Sex');
        case 'nationality': return t('id.fieldNationality', 'Nationality');
        case 'citizen':     return t('id.fieldCitizen', 'Citizen No.');
        case 'phone':       return t('id.fieldPhone', 'Phone');
        case 'class':       return t('id.fieldClass', 'Class');
        case 'employer':    return t('id.fieldEmployer', 'Employer');
        case 'rank':        return t('id.fieldRank', 'Rank');
        case 'callsign':    return t('id.fieldCallsign', 'Callsign');
        default:            return key;
    }
}

export function fieldValue(key: string, value: string): string {
    if (key === 'sex') {
        const v = value.trim().toLowerCase();
        if (v === '0' || v === 'm' || v === 'male')   return t('id.sexMale', 'Male');
        if (v === '1' || v === 'f' || v === 'female') return t('id.sexFemale', 'Female');
    }
    if (key === 'class') return value.charAt(0).toUpperCase() + value.slice(1);
    return value;
}

export function kindLabel(kind: IdCardKind): string {
    if (kind === 'state')   return t('id.kindState', 'State ID');
    if (kind === 'licence') return t('id.kindLicence', 'Licence');
    return t('id.kindJob', 'Badge');
}

export function cardTitle(card: IdCardData): string {
    if (card.kind === 'state') return t('id.stateId', 'State ID');
    return card.title;
}

export function formatCountdown(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const SEED_PORTRAIT = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=533&fit=crop';

export const SEED_CARDS: IdCardData[] = [
    {
        key: 'state', kind: 'state', title: '', color: '#2C3440', issuer: 'State of San Andreas',
        name: 'Marcus Reyes', portrait: SEED_PORTRAIT,
        fields: [
            { key: 'dob', value: '1994-03-12' }, { key: 'sex', value: '0' }, { key: 'nationality', value: 'American' },
            { key: 'citizen', value: 'LSC48219' }, { key: 'phone', value: '213-555-0148' },
        ],
    },
    {
        key: 'licence:driver', kind: 'licence', title: 'Driver Licence', color: '#1E5BC6', issuer: 'State of San Andreas',
        name: 'Marcus Reyes', portrait: SEED_PORTRAIT,
        fields: [{ key: 'class', value: 'driver' }, { key: 'citizen', value: 'LSC48219' }, { key: 'dob', value: '1994-03-12' }],
    },
    {
        key: 'licence:weapon', kind: 'licence', title: 'Weapon Licence', color: '#8A1C2B', issuer: 'State of San Andreas',
        name: 'Marcus Reyes', portrait: SEED_PORTRAIT,
        fields: [{ key: 'class', value: 'weapon' }, { key: 'citizen', value: 'LSC48219' }, { key: 'dob', value: '1994-03-12' }],
    },
    {
        key: 'job', kind: 'job', title: 'Los Santos Police', subtitle: 'Sergeant', color: '#1D4ED8', issuer: 'Los Santos Police',
        name: 'Marcus Reyes', portrait: SEED_PORTRAIT,
        fields: [{ key: 'employer', value: 'Los Santos Police' }, { key: 'rank', value: 'Sergeant' }, { key: 'callsign', value: '1-ADAM-12' }],
    },
];
