
import { t } from '@/i18n';

import nimbus   from '@/assets/tones/ringtones/nimbus.mp3';
import meridian from '@/assets/tones/ringtones/meridian.mp3';
import lantern  from '@/assets/tones/ringtones/lantern.mp3';
import prism    from '@/assets/tones/ringtones/prism.mp3';
import solstice from '@/assets/tones/ringtones/solstice.mp3';
import vesper   from '@/assets/tones/ringtones/vesper.mp3';
import drift    from '@/assets/tones/ringtones/drift.mp3';
import ember    from '@/assets/tones/ringtones/ember.mp3';

import quill   from '@/assets/tones/notification/quill.mp3';
import dew     from '@/assets/tones/notification/dew.mp3';
import wisp    from '@/assets/tones/notification/wisp.mp3';
import blip    from '@/assets/tones/notification/blip.mp3';
import murmur  from '@/assets/tones/notification/murmur.mp3';
import spark   from '@/assets/tones/notification/spark.mp3';
import flicker from '@/assets/tones/notification/flicker.mp3';
import cinder  from '@/assets/tones/notification/cinder.mp3';

export type ToneKind = 'ringtone' | 'notification';

export interface Tone {
    id:   string;
    name: string;
    url:  string;
}

function tone(id: string, url: string, name: () => string): Tone {
    return { id, url, get name() { return name(); } };
}

export const RINGTONES: Tone[] = [
    tone('nimbus',   nimbus,   () => t('settings.toneNimbus', 'Nimbus')),
    tone('meridian', meridian, () => t('settings.toneMeridian', 'Meridian')),
    tone('lantern',  lantern,  () => t('settings.toneLantern', 'Lantern')),
    tone('prism',    prism,    () => t('settings.tonePrism', 'Prism')),
    tone('solstice', solstice, () => t('settings.toneSolstice', 'Solstice')),
    tone('vesper',   vesper,   () => t('settings.toneVesper', 'Vesper')),
    tone('drift',    drift,    () => t('settings.toneDrift', 'Drift')),
    tone('ember',    ember,    () => t('settings.toneEmber', 'Ember')),
];

export const NOTIFICATION_TONES: Tone[] = [
    tone('quill',   quill,   () => t('settings.toneQuill', 'Quill')),
    tone('dew',     dew,     () => t('settings.toneDew', 'Dew')),
    tone('wisp',    wisp,    () => t('settings.toneWisp', 'Wisp')),
    tone('blip',    blip,    () => t('settings.toneBlip', 'Blip')),
    tone('murmur',  murmur,  () => t('settings.toneMurmur', 'Murmur')),
    tone('spark',   spark,   () => t('settings.toneSpark', 'Spark')),
    tone('flicker', flicker, () => t('settings.toneFlicker', 'Flicker')),
    tone('cinder',  cinder,  () => t('settings.toneCinder', 'Cinder')),
];

export const DEFAULT_RINGTONE     = 'nimbus';
export const DEFAULT_NOTIFICATION = 'flicker';

const RENAMED_IDS: Record<string, string> = {
    marimba:    'nimbus',
    reflection: 'meridian',
    classic:    'lantern',
    signal:     'prism',
    hold:       'solstice',
    aria:       'vesper',
    mirage:     'drift',
    twinkle:    'ember',
    bell:       'quill',
    chime:      'dew',
    bloom:      'wisp',
    pop:        'blip',
    bubble:     'murmur',
    glimmer:    'spark',
    note:       'flicker',
    tap:        'cinder',
};

export function canonicalToneId(id: string): string {
    return RENAMED_IDS[id] ?? id;
}

export interface CustomTone {
    id:   string;
    name: string;
    url:  string;
}

export function resolveTone(kind: ToneKind, id: string, custom: CustomTone[]): { url: string; name: string } {
    const list = listFor(kind);
    const builtin = list.find(t => t.id === id);
    if (builtin) return { url: builtin.url, name: builtin.name };
    const c = custom.find(t => t.id === id);
    if (c) return { url: c.url, name: c.name };
    const renamed = list.find(t => t.id === canonicalToneId(id));
    if (renamed) return { url: renamed.url, name: renamed.name };
    const fallback = kind === 'ringtone' ? DEFAULT_RINGTONE : DEFAULT_NOTIFICATION;
    const def = list.find(t => t.id === fallback) ?? list[0];
    return { url: def.url, name: def.name };
}

function listFor(kind: ToneKind): Tone[] {
    return kind === 'ringtone' ? RINGTONES : NOTIFICATION_TONES;
}

export function toneUrl(kind: ToneKind, id: string): string {
    const list = listFor(kind);
    const fallback = kind === 'ringtone' ? DEFAULT_RINGTONE : DEFAULT_NOTIFICATION;
    return (list.find(t => t.id === canonicalToneId(id)) ?? list.find(t => t.id === fallback) ?? list[0]).url;
}
