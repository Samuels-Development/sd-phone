import { context } from '@/media/sfx';

import { useCasinoMute } from './muteStore';

import chipLay1 from '@/assets/casino/chip-lay-1.ogg';
import chipLay2 from '@/assets/casino/chip-lay-2.ogg';
import chipLay3 from '@/assets/casino/chip-lay-3.ogg';
import chipsStack1 from '@/assets/casino/chips-stack-1.ogg';
import chipsStack2 from '@/assets/casino/chips-stack-2.ogg';
import chipsStack3 from '@/assets/casino/chips-stack-3.ogg';
import chipsHandle1 from '@/assets/casino/chips-handle-1.ogg';
import chipsHandle2 from '@/assets/casino/chips-handle-2.ogg';
import chipsCollide1 from '@/assets/casino/chips-collide-1.ogg';
import cardPlace1 from '@/assets/casino/card-place-1.ogg';
import cardPlace2 from '@/assets/casino/card-place-2.ogg';
import cardSlide1 from '@/assets/casino/card-slide-1.ogg';
import cardSlide2 from '@/assets/casino/card-slide-2.ogg';
import cardSlide3 from '@/assets/casino/card-slide-3.ogg';
import cardShuffle from '@/assets/casino/card-shuffle.ogg';
import cardFan1 from '@/assets/casino/card-fan-1.ogg';

export type SampleName =
    | 'chipLay' | 'chipStack' | 'chipHandle' | 'chipCollide'
    | 'cardPlace' | 'cardSlide' | 'cardShuffle' | 'cardFan';

const SOURCES: Record<SampleName, string[]> = {
    chipLay:     [chipLay1, chipLay2, chipLay3],
    chipStack:   [chipsStack1, chipsStack2, chipsStack3],
    chipHandle:  [chipsHandle1, chipsHandle2],
    chipCollide: [chipsCollide1],
    cardPlace:   [cardPlace1, cardPlace2],
    cardSlide:   [cardSlide1, cardSlide2, cardSlide3],
    cardShuffle: [cardShuffle],
    cardFan:     [cardFan1],
};

const buffers = new Map<string, AudioBuffer>();
const pending = new Set<string>();

function load(ac: AudioContext, url: string): void {
    if (buffers.has(url) || pending.has(url)) return;
    pending.add(url);
    void fetch(url)
        .then(r => r.arrayBuffer())
        .then(b => ac.decodeAudioData(b))
        .then(decoded => { buffers.set(url, decoded); })
        .catch(() => {})
        .finally(() => { pending.delete(url); });
}

export function primeSamples(): void {
    const ac = context();
    if (!ac) return;
    for (const urls of Object.values(SOURCES)) {
        for (const url of urls) load(ac, url);
    }
}

export function playSample(name: SampleName, gain = 0.8, detune = 0.06): boolean {
    if (useCasinoMute.getState().muted) return true;
    const ac = context();
    if (!ac) return false;
    if (ac.state === 'suspended') void ac.resume();

    const urls = SOURCES[name];
    const url = urls[Math.floor(Math.random() * urls.length)];
    const buf = buffers.get(url);
    if (!buf) { load(ac, url); return false; }

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * detune;

    const g = ac.createGain();
    g.gain.value = gain;

    src.connect(g); g.connect(ac.destination);
    src.start();
    return true;
}
