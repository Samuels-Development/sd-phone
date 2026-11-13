import { context, noiseBuffer } from '@/media/sfx';

function clack(peak: number, bandHz: number, partials: number[], dur: number): void {
    const ac = context();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume();

    const now = ac.currentTime;

    const out = ac.createGain();
    out.gain.setValueAtTime(peak, now);
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    out.connect(ac.destination);

    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = bandHz;
    band.Q.value = 1.7;
    src.connect(band);
    band.connect(out);
    src.start(now);
    src.stop(now + dur);

    for (const freq of partials) {
        const osc = ac.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        const ring = ac.createGain();
        ring.gain.setValueAtTime(peak * 0.45, now);
        ring.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.75);

        osc.connect(ring);
        ring.connect(ac.destination);
        osc.start(now);
        osc.stop(now + dur * 0.75);
    }
}

export function playHandsetLift(): void {
    clack(0.24, 2700, [1880, 3160], 0.10);
}

export function playHandsetHang(): void {
    clack(0.32, 1450, [760, 1210], 0.22);
}
