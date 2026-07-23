import type { OpenPayload } from './types';


export function devInjectMockData(): () => void {
    document.documentElement.style.setProperty('background', '#0a0a0a', 'important');
    document.body.style.setProperty('background', '#0a0a0a', 'important');
    document.body.style.minHeight = '100vh';

    const payload: OpenPayload = {
        locked:   true,
        battery:  86,
        carrier:  'LifeInvader',
        signal:   4,
        showWifi: true,
        use24h:   false,
        showDate: true,
        dock:     ['phone', 'messages', 'camera', 'photos'],
        apps: [
            { id: 'phone',    label: 'Phone',     icon: 'phone',    route: '/phone',    accent: '#34c759', base: true },
            { id: 'messages', label: 'Messages',  icon: 'messages', route: '/messages', accent: '#34c759', base: true },
            { id: 'mail',     label: 'Mail',      icon: 'mail',     route: '/mail',     accent: '#0a84ff', base: true },
            { id: 'maps',     label: 'Maps',      icon: 'maps',     route: '/maps',     accent: '#f0c43a', base: true },
            { id: 'compass',  label: 'Compass',   icon: 'compass',  route: '/compass',  accent: '#1c1c1e', base: true },
            { id: 'camera',   label: 'Camera',    icon: 'camera',   route: '/camera',   accent: '#1c1c1e', base: true },
            { id: 'photos',   label: 'Photos',    icon: 'photos',   route: '/photos',   accent: '#ffffff', base: true },
            { id: 'music',    label: 'Music',     icon: 'music',    route: '/music',    accent: '#fa233b', base: true },
            { id: 'weather',  label: 'Weather',   icon: 'weather',  route: '/weather',  accent: '#5ac8fa', base: true },
            { id: 'clock',    label: 'Clock',     icon: 'clock',    route: '/clock',    accent: '#1c1c1e', base: true },
            { id: 'calendar', label: 'Calendar',  icon: 'calendar', route: '/calendar', accent: '#ffffff', base: true },
            { id: 'notes',    label: 'Notes',     icon: 'notes',    route: '/notes',    accent: '#fec547', base: true },
            { id: 'voicememos', label: 'Voice Memos', icon: 'voicememos', route: '/voicememos', accent: '#ff3b30', base: true },
            { id: 'bank',     label: 'Bank',      icon: 'bank',     route: '/bank',     accent: '#00b894', base: true },
            { id: 'health',   label: 'Health',    icon: 'health',   route: '/health',   accent: '#ff2d55', base: true },
            { id: 'documents', label: 'Files',    icon: 'documents', route: '/documents', accent: '#3478F6', base: true },
            { id: 'groups',   label: 'Groups',    icon: 'groups',   route: '/groups',   accent: '#6C63FF' },
            { id: 'birdy',    label: 'Birdy',     icon: 'birdy',    route: '/birdy',    accent: '#1d9bf0' },
            { id: 'services', label: 'Services',  icon: 'services', route: '/services', accent: '#16B8A6' },
            { id: 'pages',    label: 'Pages',     icon: 'pages',    route: '/pages',    accent: '#FBC02D' },
            { id: 'marketplace', label: 'Marketplace', icon: 'marketplace', route: '/marketplace', accent: '#0a84ff' },
            { id: 'darkchat',    label: 'Dark Chat',   icon: 'darkchat',    route: '/darkchat',    accent: '#1c1c1e' },
            { id: 'cherry',      label: 'Cherry',      icon: 'cherry',      route: '/cherry',      accent: '#F0285A' },
            { id: 'photogram',   label: 'Photogram',   icon: 'photogram',   route: '/photogram',   accent: '#D62976' },
            { id: 'garages',     label: 'Garages',     icon: 'garages',     route: '/garages',     accent: '#6E5CF2' },
            { id: 'homes',       label: 'Homes',       icon: 'homes',       route: '/homes',       accent: '#12B866' },
            { id: 'stocks',      label: 'Stocks',      icon: 'stocks',      route: '/stocks',      accent: '#16C784' },
            { id: 'ryde',        label: 'Ryde',        icon: 'ryde',        route: '/ryde',        accent: '#1c1c1e' },
            { id: 'radio',       label: 'Radio',       icon: 'radio',       route: '/radio',       accent: '#30B0C7' },
            { id: 'settings',   label: 'Settings',    icon: 'settings',   route: '/settings',   accent: '#8e8e93', base: true },
            { id: 'appstore',   label: 'App Store',   icon: 'appstore',   route: '/appstore',   accent: '#0a84ff', base: true },
            { id: 'calculator', label: 'Calculator',  icon: 'calculator', route: '/calculator', accent: '#333335', base: true },
            { id: 'cookie',     label: 'Cookie',      icon: 'cookie',     route: '/cookie',     accent: '#C77D2E' },
            { id: 'wordle',     label: 'Wordle',      icon: 'wordle',     route: '/wordle',     accent: '#6AAA64' },
            { id: 'flappy',     label: 'Flappy',      icon: 'flappy',     route: '/flappy',     accent: '#4EC0CA' },
            { id: 'blocks',     label: 'Blocks',      icon: 'blocks',     route: '/blocks',     accent: '#7C4DFF' },
            { id: 'blackjack',  label: 'Blackjack',   icon: 'blackjack',  route: '/blackjack',  accent: '#157347' },
            { id: 'climber',    label: 'Climber',     icon: 'climber',    route: '/climber',    accent: '#8BC34A' },
            { id: 'connectfour', label: 'Connect 4',  icon: 'connectfour', route: '/connectfour', accent: '#1E66D0' },
            { id: 'chess',      label: 'Chess',       icon: 'chess',      route: '/chess',      accent: '#3B3B3B' },
            { id: 'battleship', label: 'Battleship',  icon: 'battleship', route: '/battleship', accent: '#1E66D0' },
            { id: 'passwords',  label: 'Passwords',   icon: 'passwords',  route: '/passwords',  accent: '#8e8e93' },
            { id: 'vibez',      label: 'Vibez',       icon: 'vibez',      route: '/vibez',      accent: '#A855F7' },
            { id: 'weazelnews', label: 'Weazel News', icon: 'weazelnews', route: '/weazelnews', accent: '#C8102E' },
            { id: 'streaks',    label: 'Streaks',     icon: 'streaks',    route: '/streaks',    accent: '#FF7A1A' },
        ],
        locale: new URLSearchParams(window.location.search).get('loc') ?? 'en',
        wallpaper: { lock: 'lockscreen.jpg', home: 'lockscreen.jpg' },
    };

    window.postMessage({ action: 'sd-phone:open', data: payload }, '*');

    window.postMessage({
        action: 'sd-phone:session',
        data:   { startMs: Date.now() - (2 * 3600 + 17 * 60) * 1000 },
    }, '*');

    const seedNotifs = [
        { id: 'seed-vibez',    app: 'vibez',    appId: 'vibez',    title: 'Marcus',         body: 'hey',                                        time: '11 Jun' },
        { id: 'seed-messages', app: 'messages', appId: 'messages', title: 'Tommy V',        body: 'Sure Thing!',                                time: '13:15'  },
        { id: 'seed-garages',  app: 'garages',  appId: 'garages',  title: 'Vehicle Update', body: 'Your vehicle (ABC 123) is ready for pickup', time: '15:14'  },
    ];
    const seedTimers = seedNotifs.map((n, i) =>
        window.setTimeout(() => window.postMessage({ action: 'sd-phone:notification', data: n }, '*'), 400 + i * 350),
    );

    seedTimers.push(window.setTimeout(
        () => window.postMessage({ action: 'sd-phone:badges', data: { messages: 2, phone: 3, mail: 5, groups: 1 } }, '*'),
        400,
    ));

    let battery = payload.battery;
    const tick = window.setInterval(() => {
        battery = Math.max(0, battery - 1);
        window.postMessage({ action: 'sd-phone:battery', data: battery }, '*');
    }, 8000);

    const weatherCycle = ['EXTRASUNNY', 'CLEAR', 'CLOUDS', 'OVERCAST', 'RAIN', 'THUNDER', 'CLEARING'];
    let wIdx = 0;
    function pushWeather() {
        window.postMessage({
            action: 'sd-phone:weather',
            data: {
                current: weatherCycle[wIdx],
                next:    weatherCycle[(wIdx + 1) % weatherCycle.length],
            },
        }, '*');
    }
    pushWeather();
    const weatherTick = window.setInterval(() => {
        wIdx = (wIdx + 1) % weatherCycle.length;
        pushWeather();
    }, 12000);

    let mockSteps = 1284;
    let mockDistM = 1284 * 0.762;
    let mockHr    = 78;
    function pushHealth() {
        mockSteps += 1.83;
        mockDistM += 1.39;
        mockHr = mockHr + (90 - mockHr) * 0.05 + (Math.random() - 0.5) * 3;
        window.postMessage({
            action: 'sd-phone:health',
            data: {
                steps:     Math.floor(mockSteps),
                distanceM: mockDistM,
                heartRate: Math.round(mockHr),
                state:     'walking',
            },
        }, '*');
    }
    pushHealth();
    const healthTick = window.setInterval(pushHealth, 1000);

    console.log(
        '%c[sd-phone dev]',
        'color:#0a84ff;font-weight:bold',
        'Mock data injected. Press H to skip lockscreen, L to relock.',
    );

    return () => {
        window.clearInterval(tick);
        window.clearInterval(weatherTick);
        window.clearInterval(healthTick);
        seedTimers.forEach(window.clearTimeout);
    };
}
