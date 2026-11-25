import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { sdkAssets } from './vite-plugin-sdk.ts';

// 3D models ride inside their importing chunk as data URLs. FiveM's NUI file server answers
// 404 for a .glb even when fxmanifest lists it, so a separate asset file never reaches the
// page, and Vite 8's own `?inline` route cannot load the file on Windows.
function inlineModels(): Plugin {
    return {
        name: 'sd-inline-models',
        enforce: 'pre',
        load(id) {
            if (!id.endsWith('.glb')) return null;
            const base64 = readFileSync(id).toString('base64');
            return `export default ${JSON.stringify(`data:model/gltf-binary;base64,${base64}`)};`;
        },
    };
}

// The UI catalogs ship as locales/*.json, which fxmanifest already sends for the Lua side and
// the phone fetches at runtime, so the FiveM build bundles none of them and only learns which
// codes exist. The demo, the dev server, tests and sd-tablet (whose config has no such define)
// bundle every catalog instead.
function localeCodes(): string[] {
    return readdirSync(new URL('../locales', import.meta.url))
        .filter(file => file.endsWith('.json') && file !== 'en.json')
        .map(file => file.slice(0, -'.json'.length))
        .sort();
}

export default defineConfig(({ mode }) => ({
    plugins: [inlineModels(), react(), sdkAssets()],
    base: './',
    define: mode === 'production'
        ? {
            'import.meta.env.SD_FETCH_LOCALES': 'true',
            'import.meta.env.SD_LOCALE_CODES': JSON.stringify(localeCodes()),
        }
        : {},
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            // The device profile this build targets. sd-tablet points the same alias at its own
            // profile and compiles this exact source tree against it.
            '@device': fileURLToPath(new URL('./src/device/phone.ts', import.meta.url)),
        },
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
