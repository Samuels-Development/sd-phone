/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // iOS system palette — sampled from Apple's HIG colour swatches.
                // Used for app-icon accents, status-bar glyphs, and the few
                // system surfaces that aren't translucent.
                ios: {
                    // User-selectable accent. Channels live in index.css
                    // :root/.dark and are overridden per choice from App.tsx.
                    blue:    'rgb(var(--ios-blue) / <alpha-value>)',
                    green:   '#34c759',
                    indigo:  '#5e5ce6',
                    orange:  '#ff9f0a',
                    pink:    '#ff375f',
                    purple:  '#bf5af2',
                    red:     '#ff453a',
                    teal:    '#64d2ff',
                    yellow:  '#ffd60a',
                    // Theme-aware secondary grey — darker in light mode,
                    // brighter in dark. Channels live in index.css :root/.dark.
                    gray:    'rgb(var(--ios-gray) / <alpha-value>)',
                    gray2:   '#aeaeb2',
                    gray3:   '#c7c7cc',
                    gray4:   '#d1d1d6',
                    gray5:   '#e5e5ea',
                    gray6:   '#f2f2f7',
                },
                // Dark-mode surface ramp. Only used behind the `dark:` variant;
                // the selectable dark palette (Graphite/Black/Warm) swaps the
                // channels in index.css by data-dark-theme.
                // Primary text and hairlines, flipped by the `dark` class rather
                // than by palette: black-on-light, white-on-dark. Lets a light-only
                // app adopt dark mode by swapping text-black -> text-label and
                // border-black/10 -> border-hairline/10, alpha suffixes intact.
                label:    'rgb(var(--label) / <alpha-value>)',
                hairline: 'rgb(var(--hairline) / <alpha-value>)',
                base:     'rgb(var(--base) / <alpha-value>)',
                surface:  'rgb(var(--surface) / <alpha-value>)',
                elevated: 'rgb(var(--elevated) / <alpha-value>)',
                control:  'rgb(var(--control) / <alpha-value>)',
                // Translucent surface tokens for the dock, control center,
                // notification cards. Backed by `backdrop-blur` in JSX.
                glass: {
                    'dock':   'rgba(255, 255, 255, 0.18)',
                    'dock-border': 'rgba(255, 255, 255, 0.22)',
                    'card':   'rgba(40, 40, 45, 0.55)',
                    'card-border': 'rgba(255, 255, 255, 0.12)',
                },
            },
            fontFamily: {
                // SF Pro is paywalled; the stack falls through to the system
                // font on Apple devices and to Inter / system-ui elsewhere so
                // letterforms remain SF-shaped rather than Arial-flat.
                sf: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif'],
                sfRound: ['"SF Pro Rounded"', '-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif'],
            },
            // Phone viewport. The iphone_regular.png frame is ~390x844 with
            // ~22px of bezel around a screen of roughly 346x750. These
            // tokens let JSX compose against the viewport without
            // pixel-hunting at every call site.
            width: {
                'phone':       '390px',
                'phone-screen': '346px',
            },
            height: {
                'phone':       '844px',
                'phone-screen': '750px',
            },
            borderRadius: {
                'phone':       '54px',
                'phone-screen': '40px',
            },
            keyframes: {
                'slide-up-fade': {
                    '0%':   { opacity: 0, transform: 'translateY(12px)' },
                    '100%': { opacity: 1, transform: 'translateY(0)' },
                },
                'slide-down-fade': {
                    '0%':   { opacity: 0, transform: 'translateY(-12px)' },
                    '100%': { opacity: 1, transform: 'translateY(0)' },
                },
                // A lockscreen notification dropping in from the top, iOS-style:
                // fade + slide down with a gentle settle.
                'notif-drop': {
                    '0%':   { opacity: 0, transform: 'translateY(-16px) scale(0.95)' },
                    '55%':  { opacity: 1 },
                    '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
                },
                // Exit mirror of slide-up-fade (a distinct name is required —
                // re-running the same animation-name doesn't restart it).
                'slide-out-down': {
                    '0%':   { opacity: 1, transform: 'translateY(0)' },
                    '100%': { opacity: 0, transform: 'translateY(12px)' },
                },
                'fade-in': {
                    '0%':   { opacity: 0 },
                    '100%': { opacity: 1 },
                },
                // Apple-Maps-style pin drop: falls onto its tip with a little
                // squash-and-settle bounce.
                'pin-drop': {
                    '0%':   { opacity: 0, transform: 'translateY(-18px) scale(0.7)' },
                    '55%':  { opacity: 1, transform: 'translateY(3px) scale(1.04)' },
                    '75%':  { transform: 'translateY(-2px) scale(0.98)' },
                    '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
                },
                'unlock-pull': {
                    '0%':   { transform: 'translateY(0)',     opacity: 1 },
                    '70%':  { transform: 'translateY(-80%)',  opacity: 0.6 },
                    '100%': { transform: 'translateY(-100%)', opacity: 0 },
                },
                'icon-pop': {
                    '0%':   { transform: 'scale(0.94)' },
                    '50%':  { transform: 'scale(1.04)' },
                    '100%': { transform: 'scale(1.00)' },
                },
                'swipe-in-left': {
                    '0%':   { opacity: 0, transform: 'translateX(-48px)' },
                    '100%': { opacity: 1, transform: 'translateX(0)' },
                },
                // Directional tab-content slides (e.g. Font ↔ Layout in the lock
                // clock editor): the incoming panel enters from the side matching
                // the travel direction.
                'tab-in-right': {
                    '0%':   { opacity: 0, transform: 'translateX(26px)' },
                    '100%': { opacity: 1, transform: 'translateX(0)' },
                },
                'tab-in-left': {
                    '0%':   { opacity: 0, transform: 'translateX(-26px)' },
                    '100%': { opacity: 1, transform: 'translateX(0)' },
                },
                // Angle is overridable via --jiggle because rotation displaces a corner in
                // proportion to its distance from the centre: the 1.7deg that reads as a subtle
                // wobble on a 78px icon throws a 4x4 widget's corner about five times as far.
                // Large tiles pass a smaller angle so every element sweeps the same few pixels.
                'app-jiggle': {
                    '0%, 100%': { transform: 'rotate(calc(var(--jiggle, 1.7deg) * -1))' },
                    '50%':      { transform: 'rotate(var(--jiggle, 1.7deg))' },
                },
                'plop': {
                    '0%':   { transform: 'scale(1)' },
                    '32%':  { transform: 'scale(1.18)' },
                    '62%':  { transform: 'scale(0.93)' },
                    '100%': { transform: 'scale(1)' },
                },
                // Skeleton shimmer: a highlight band sweeping a wide gradient background.
                'shimmer': {
                    '0%':   { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                // Like feedback: the heart overshoots then settles...
                'heart-pop': {
                    '0%':   { transform: 'scale(1)' },
                    '30%':  { transform: 'scale(1.38)' },
                    '60%':  { transform: 'scale(0.88)' },
                    '100%': { transform: 'scale(1)' },
                },
                // ...while a ring blooms outward and dissolves behind it.
                'burst-ring': {
                    '0%':   { transform: 'scale(0.3)', opacity: 0.55 },
                    '70%':  { transform: 'scale(1.25)', opacity: 0.22 },
                    '100%': { transform: 'scale(1.55)', opacity: 0 },
                },
                // Clout audio disc: the track thumbnail turning while a clip plays.
                'disc-spin': {
                    from: { transform: 'rotate(0deg)' },
                    to:   { transform: 'rotate(360deg)' },
                },
                // A terminal pane taking the stage: short rise and fade, no
                // horizontal travel, since the sidebar stays put beside it.
                'mdt-pane': {
                    '0%':   { opacity: 0, transform: 'translateY(7px)' },
                    '100%': { opacity: 1, transform: 'translateY(0)' },
                },
                // A record drilling in over its master list.
                'mdt-detail': {
                    '0%':   { opacity: 0, transform: 'translateX(18px)' },
                    '100%': { opacity: 1, transform: 'translateX(0)' },
                },
            },
            animation: {
                'slide-up-fade':   'slide-up-fade 0.32s ease-out',
                'slide-down-fade': 'slide-down-fade 0.32s ease-out',
                'notif-drop':      'notif-drop 0.44s cubic-bezier(0.22,1,0.32,1.04)',
                'slide-out-down':  'slide-out-down 0.3s ease-in forwards',
                'fade-in':         'fade-in 0.4s ease-out',
                'pin-drop':        'pin-drop 0.45s cubic-bezier(0.22,0.61,0.36,1)',
                'unlock-pull':     'unlock-pull 0.45s cubic-bezier(0.4, 0.0, 0.2, 1) forwards',
                'icon-pop':        'icon-pop 0.18s ease-out',
                'swipe-in-left':   'swipe-in-left 0.45s cubic-bezier(0.22,1,0.36,1)',
                'tab-in-right':    'tab-in-right 0.26s cubic-bezier(0.22,0.9,0.3,1)',
                'tab-in-left':     'tab-in-left 0.26s cubic-bezier(0.22,0.9,0.3,1)',
                'app-jiggle':      'app-jiggle 0.32s ease-in-out infinite',
                'plop':            'plop 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                'shimmer':         'shimmer 1.6s linear infinite',
                'heart-pop':       'heart-pop 0.42s cubic-bezier(0.34,1.56,0.64,1)',
                'burst-ring':      'burst-ring 0.5s ease-out forwards',
                'disc-spin':       'disc-spin 4s linear infinite',
                'mdt-pane':        'mdt-pane 0.24s cubic-bezier(0.22,0.9,0.3,1)',
                'mdt-detail':      'mdt-detail 0.26s cubic-bezier(0.22,0.9,0.3,1)',
            },
        },
    },
    plugins: [],
};
