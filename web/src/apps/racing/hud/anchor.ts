import type { CSSProperties } from 'react';

import type { HudPosition } from '@/apps/racing/data';

export const HUD_EDGE_PX = 20;

export function hudAnchor(position: HudPosition, mode: 'fixed' | 'absolute', edgePx: number = HUD_EDGE_PX) {
    const dash = position.indexOf('-');
    const row  = position.slice(0, dash);
    const col  = position.slice(dash + 1);

    const frame: CSSProperties = { position: mode };
    const shift: string[] = [];

    if (row === 'top') frame.top = edgePx;
    else if (row === 'bottom') frame.bottom = edgePx;
    else { frame.top = '50%'; shift.push('translateY(-50%)'); }

    if (col === 'left') frame.left = edgePx;
    else if (col === 'right') frame.right = edgePx;
    else { frame.left = '50%'; shift.push('translateX(-50%)'); }

    if (shift.length > 0) frame.transform = shift.join(' ');

    return {
        frame,
        origin:  `${row === 'middle' ? 'center' : row} ${col}`,
        stackUp: row === 'bottom',
    };
}
