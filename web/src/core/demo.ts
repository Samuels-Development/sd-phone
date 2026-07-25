
// True in `npm run dev` and in the public website demo build (`npm run
// build:demo`). Gates the seeded sessions that stand in for a logged-in
// player, so account-gated apps open instead of showing a login wall.
export const useMocks: boolean = import.meta.env.DEV || import.meta.env.VITE_DEMO === '1';
