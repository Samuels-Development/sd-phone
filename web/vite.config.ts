import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
    plugins: [react()],
    base: './',
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // The UI locale catalog lives in the resource-root locales/ folder (shared
    // with the Lua side), which is above the Vite root — allow the dev server to
    // read it. The production build (rollup) resolves the relative import fine.
    server: { fs: { allow: ['..'] } },
    build: {
        // FiveM's CEF and the dev browser (Edge) are both modern Chromium, so
        // skip downleveling to the generic es2020 baseline.
        target: 'chrome110',
        // Output to `web/build/` so fxmanifest.lua's `ui_page` reference
        // (`web/build/index.html`) resolves both pre-build (vanilla
        // fallback) and post-build (Vite-rendered React). The website demo
        // build gets its own folder — it bypasses the account gates, so it
        // must never end up as the bundle the game serves.
        outDir: mode === 'demo' ? 'build-demo' : 'build',
        emptyOutDir: true,
        assetsDir: 'assets',
        cssCodeSplit: false,
        rollupOptions: {
            output: {
                // Fingerprint the entry too. fxmanifest globs
                // `web/build/assets/*.js` and the generated index.html points at
                // whatever the hash is, so the name can change freely. It MUST
                // change, because FiveM's NUI caches `index.js` by URL and serves
                // a stale copy across restarts when the name is fixed (this
                // silently shipped old bundles during dev).
                entryFileNames: 'assets/index-[hash].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]',
            },
        },
    },
}));
