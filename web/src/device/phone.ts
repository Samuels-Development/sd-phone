import type { DeviceProfile } from './types';

export const device: DeviceProfile = {
    id:           'phone',
    rpcAction:    null,
    calls:        true,
    payphone:     true,
    admin:        true,
    setup:        true,
    excludedApps: [],
    defaultAlign: 'bottom-right',
    defaultScale: 50,
    screen: {
        w:      440,
        h:      956,
        bezel:  9,
        radius: 55,
        island: true,
        buttons: [
            { side: 'left',  y: 174, h: 38, role: 'screenshot' },
            { side: 'left',  y: 252, h: 64, role: 'volumeUp' },
            { side: 'left',  y: 346, h: 64, role: 'volumeDown' },
            { side: 'right', y: 217, h: 80, role: 'power' },
            { side: 'right', y: 566, h: 60, role: 'fold' },
        ],
        grid: {
            cols:      4,
            rows:      6,
            padX:      28,
            icon:      78,
            colStride: 102,
            rowY0:     8,
            rowStride: 122,
            stripTop:  70,
        },
        densities: {
            compact: { cols: 5, rows: 7, padX: 22, icon: 62 },
            large:   { cols: 3, rows: 5, padX: 40, icon: 96 },
        },
    },
};
