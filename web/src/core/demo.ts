
export const isDemo: boolean = import.meta.env.VITE_DEMO === '1';

export const useMocks: boolean = import.meta.env.DEV || isDemo;

export const demoAdminOnly: boolean =
    (isDemo || import.meta.env.DEV)
    && typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('admin');
