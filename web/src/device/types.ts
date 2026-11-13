
export type DeviceId = 'phone' | 'tablet';

export type DeviceAlign =
    | 'top-left'    | 'top-center'    | 'top-right'
    | 'middle-left' | 'middle-center' | 'middle-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface DeviceButton {
    side: 'left' | 'right';
    y: number;
    h: number;
    role?: 'volumeUp' | 'volumeDown' | 'power' | 'screenshot' | 'fold';
}

export interface DeviceGrid {
    cols: number;
    rows: number;
    padX: number;
    icon: number;
    colStride: number;
    rowY0: number;
    rowStride: number;
    stripTop: number;
}

export type Density = 'compact' | 'default' | 'large';

export interface DeviceDensity {
    cols: number;
    rows: number;
    padX: number;
    icon: number;
}

export type DeviceFinish = 'polished' | 'matte';

export interface DeviceScreen {
    w: number;
    h: number;
    bezel: number;
    radius: number;
    island: boolean;
    finish?: DeviceFinish;
    buttonWidth?: number;
    buttons: readonly DeviceButton[];
    grid: DeviceGrid;
    densities: Record<Exclude<Density, 'default'>, DeviceDensity>;
    dockFill?: boolean;
}

export interface DeviceProfile {
    id: DeviceId;
    rpcAction: string | null;
    calls: boolean;
    payphone: boolean;
    admin: boolean;
    setup: boolean;
    excludedApps: readonly string[];
    defaultAlign: DeviceAlign;
    defaultScale: number;
    screen: DeviceScreen;
}
