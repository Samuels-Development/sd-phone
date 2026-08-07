// The device this bundle is built for.
//
// sd-phone builds `device/phone.ts`; the sibling sd-tablet resource builds the SAME source tree
// against its own profile through the `@device` alias. Everything that differs between a phone
// and a tablet - frame geometry, home-grid shape, whether the device can place a call - is a
// field here, so no app file ever branches on the device it happens to be running on.

export type DeviceId = 'phone' | 'tablet';

/** Where the device sits on screen. Mirrors the nine positions Settings offers. */
export type DeviceAlign =
    | 'top-left'    | 'top-center'    | 'top-right'
    | 'middle-left' | 'middle-center' | 'middle-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right';

/** One physical side button on the frame rail. */
export interface DeviceButton {
    /** Which rail it sits on; `x` is derived from the frame width. */
    side: 'left' | 'right';
    /** Distance from the top of the frame, in frame px. */
    y: number;
    /** Button height in frame px. */
    h: number;
    /** What tapping it does. Buttons without a role are decorative. */
    role?: 'volumeUp' | 'volumeDown' | 'power' | 'screenshot';
}

/** Home-screen icon grid. All values are screen px. */
export interface DeviceGrid {
    cols: number;
    rows: number;
    /** Left/right padding before the first icon column. */
    padX: number;
    /** Icon tile edge length. */
    icon: number;
    /** Column pitch (icon + horizontal gap). */
    colStride: number;
    /** Y of the first icon row, measured from the top of the grid strip. */
    rowY0: number;
    /** Row pitch (icon + label + vertical gap). */
    rowStride: number;
    /** Height of the status-bar strip the grid starts below. */
    stripTop: number;
}

/**
 * Chassis finish. `polished` is the phone's high-contrast metal sweep, which sells a small rail.
 * `matte` flattens the same ramp for a large slab, where that sweep reads as a shiny toy rather
 * than anodised aluminium.
 */
export type DeviceFinish = 'polished' | 'matte';

export interface DeviceScreen {
    /** Screen width/height in CSS px - the coordinate space every app is laid out in. */
    w: number;
    h: number;
    /** Frame thickness around the screen. */
    bezel: number;
    /** Outer frame corner radius; the screen radius is this minus the bezel. */
    radius: number;
    /** Dynamic Island cutout, pills and the lens dot. Tablets have none. */
    island: boolean;
    /** How the chassis is shaded. Defaults to `polished`, the phone's look. */
    finish?: DeviceFinish;
    /** Side-button thickness in frame px. Defaults to 3.5, the phone's rail. */
    buttonWidth?: number;
    buttons: readonly DeviceButton[];
    grid: DeviceGrid;
    /**
     * Dock width. `true` stretches the tray edge to edge and spreads its icons across it, which
     * suits a narrow phone. `false` sizes the tray to its contents and centres it, the way a
     * tablet dock floats. Defaults to `true`.
     */
    dockFill?: boolean;
}

export interface DeviceProfile {
    id: DeviceId;
    /**
     * NUI transport. `null` posts each action to its own callback name (the phone, unchanged).
     * A string wraps every call in a single `{ action, payload }` envelope posted to that one
     * callback - which is how a companion device forwards them into sd-phone's client.
     */
    rpcAction: string | null;
    /** Voice calls: the dialler, the call overlay, and every in-app "call" affordance. */
    calls: boolean;
    /** The street payphone UI (a call surface of its own). */
    payphone: boolean;
    /** The admin panel overlay. */
    admin: boolean;
    /** Run the first-run setup wizard. Off inherits the phone's settings instead. */
    setup: boolean;
    /** App ids this device does not have. Excluded ids can't be launched by any route. */
    excludedApps: readonly string[];
    /** Where it sits before the player moves it in Settings. */
    defaultAlign: DeviceAlign;
    defaultScale: number;
    screen: DeviceScreen;
}
