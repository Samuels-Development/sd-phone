/// <reference types="vite/client" />

interface ImportMetaEnv {
    // '1' in the public website demo build. See core/demo.ts.
    readonly VITE_DEMO?: string;
    readonly SD_FETCH_LOCALES?: boolean;
    readonly SD_LOCALE_CODES?: string[];
}

declare module '*.glb' {
    const src: string;
    export default src;
}
