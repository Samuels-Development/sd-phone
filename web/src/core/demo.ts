
// True only in the public website demo build (`npm run build:demo`), where
// the phone is embedded in a page that draws its own backdrop.
export const isDemo: boolean = import.meta.env.VITE_DEMO === '1';

// True in `npm run dev` and in the demo build. Gates the seeded sessions
// that stand in for a logged-in player, so account-gated apps open instead
// of showing a login wall.
export const useMocks: boolean = import.meta.env.DEV || isDemo;
