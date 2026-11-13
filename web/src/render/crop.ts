export type Orientation = 'portrait' | 'landscape';

export const PORTRAIT_CROP  = { width: 0.42, height: 1.0 } as const;
export const LANDSCAPE_CROP = { width: 0.92, height: 0.52 } as const;

export const SELFIE_CROP_BIAS_X = 0.12;

export interface CropRegion {
    offsetX: number;
    offsetY: number;
    width:   number;
    height:  number;
}

function fitToAspect(
    base: { width: number; height: number },
    screenW: number,
    screenH: number,
    aspect: number | undefined,
): { width: number; height: number } {
    if (!aspect || !(aspect > 0) || !Number.isFinite(aspect)) return base;
    const width = (base.height * screenH * aspect) / screenW;
    return width <= 1 ? { width, height: base.height } : { width: 1, height: screenW / (aspect * screenH) };
}

export function computeCropRegion(
    screenW: number,
    screenH: number,
    zoom: number,
    orientation: Orientation,
    biasX = 0,
    aspect?: number,
): CropRegion {
    const base   = fitToAspect(orientation === 'landscape' ? LANDSCAPE_CROP : PORTRAIT_CROP, screenW, screenH, aspect);
    const wf     = Math.min(1, base.width  / zoom);
    const hf     = Math.min(1, base.height / zoom);
    const width  = Math.floor(screenW * wf);
    const height = Math.floor(screenH * hf);
    const centeredX = Math.floor((screenW - width) / 2);
    const offsetX = Math.max(0, Math.min(screenW - width, centeredX - Math.round(biasX * screenW)));
    return {
        width,
        height,
        offsetX,
        offsetY: Math.floor((screenH - height) / 2),
    };
}
