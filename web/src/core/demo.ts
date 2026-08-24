
// True only in the public website demo build (`npm run build:demo`), where
// the phone is embedded in a page that draws its own backdrop.
export const isDemo: boolean = import.meta.env.VITE_DEMO === '1';

// True in `npm run dev` and in the demo build. Gates the seeded sessions
// that stand in for a logged-in player, so account-gated apps open instead
// of showing a login wall.
export const useMocks: boolean = import.meta.env.DEV || isDemo;

// The website's bench frames this bundle at `?admin=1` to show the staff panel
// on its own, and `npm run dev` accepts the same flag so the panel can be worked
// on without a game client. The phone is not rendered at all in that mode: booting
// it first and opening the panel over it flashes a device the visitor did not ask
// for, and leaves one behind the panel's transparent backdrop.
export const demoAdminOnly: boolean =
    (isDemo || import.meta.env.DEV)
    && typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('admin');
