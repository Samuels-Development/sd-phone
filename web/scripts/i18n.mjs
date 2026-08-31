import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB  = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..');
const SRC  = join(WEB, 'src');
const LOCALES = join(ROOT, 'locales');

const rel = p => relative(ROOT, p).replace(/\\/g, '/');

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}

// Reads one JS string literal starting at src[i] (which must be a quote).
// Returns { value, end } with escapes resolved, or null when the literal is not
// a plain one (a template with ${...} interpolation cannot be a static fallback).
function readLiteral(src, i) {
    const quote = src[i];
    if (quote !== "'" && quote !== '"' && quote !== '`') return null;
    let out = '';
    for (let j = i + 1; j < src.length; j++) {
        const c = src[j];
        if (c === '\\') {
            const n = src[j + 1];
            out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
            j++;
            continue;
        }
        if (quote === '`' && c === '$' && src[j + 1] === '{') return null;
        if (c === quote) return { value: out, end: j };
        out += c;
    }
    return null;
}

function skipSpace(src, i) {
    while (i < src.length && /\s/.test(src[i])) i++;
    return i;
}

// Every t(key, fallback) call in one file. Reports template-literal keys
// separately: those are built at runtime and must be declared in DYNAMIC below.
function scanFile(path) {
    const src = readFileSync(path, 'utf8');
    const calls = [];
    const dynamic = [];

    for (let i = 0; i < src.length; i++) {
        if (src[i] !== 't' || src[i + 1] !== '(') continue;
        // reject identifiers ending in t, e.g. format(, split(
        if (i > 0 && /[A-Za-z0-9_$.]/.test(src[i - 1])) continue;

        let j = skipSpace(src, i + 2);
        const key = readLiteral(src, j);
        const line = src.slice(0, i).split('\n').length;

        if (!key) {
            // A template key is fine when its static prefix is covered by dynamicKeys(),
            // e.g. `widgets.size.${s}` against the declared widgets.size.* group.
            let prefix = null;
            if (src[j] === '`') {
                const lit = src.slice(j + 1, src.indexOf('${', j));
                if (lit && !lit.includes('`')) prefix = lit;
            }
            if (src[j] === '`' || /[A-Za-z_$]/.test(src[j])) dynamic.push({ file: rel(path), line, prefix });
            continue;
        }
        j = skipSpace(src, key.end + 1);
        if (src[j] !== ',') continue;
        j = skipSpace(src, j + 1);
        const fb = readLiteral(src, j);
        if (!fb) continue;

        calls.push({ key: key.value, fallback: fb.value, file: rel(path), line });
    }
    return { calls, dynamic };
}

// The server refuses in English and sends a key alongside it, because it has no per-player
// language. Both shapes carry the key and the English text, so the catalogue is generated from
// the Lua source the same way it is from t() calls:
//   fail('ns.key', 'English text')
//   { success = false, messageKey = 'ns.key', message = 'English text' }
// A phone-notification banner is the same pairing on its own two fields, and its English is
// already formatted at the call site, so the vars table names the spans for the catalogue:
//   titleKey = 'ns.key', title = 'English text'
//   bodyKey = 'ns.key', body = ('English %s'):format(x), bodyVars = { name = x }
function luaKeys() {
    // Reads the English a titleKey/bodyKey names: either a plain Lua string or the literal of a
    // ('...'):format(...) call, whose specifiers are renamed after the sibling titleVars/bodyVars
    // entries, in order. Returns null when the fallback is not a literal at all.
    function luaBanner(src, i, field) {
        let j = i;
        const wrapped = src[j] === '(';
        if (wrapped) j++;
        const quote = src[j];
        if (quote !== "'" && quote !== '"') return null;

        let text = '';
        for (j++; j < src.length; j++) {
            const c = src[j];
            if (c === '\\') {
                const n = src[j + 1];
                text += n === 'n' ? '\n' : n === 't' ? '\t' : n;
                j++;
                continue;
            }
            if (c === quote) break;
            text += c;
        }
        if (j >= src.length) return null;
        if (!wrapped || !/^\s*\)\s*:format\(/.test(src.slice(j + 1))) return text;

        let tail = src.slice(j, j + 800);
        const close = tail.indexOf('})');
        if (close >= 0) tail = tail.slice(0, close);
        const table = tail.match(new RegExp(field + 'Vars\\s*=\\s*\\{([^}]*)\\}'));

        const names = [];
        if (table) {
            const name = /(?:^|,)\s*([A-Za-z_]\w*)\s*=(?!=)/g;
            let v;
            while ((v = name.exec(table[1]))) names.push(v[1]);
        }

        let n = 0;
        return text.replace(/%%|%[-+ #0]*\d*(?:\.\d+)?[A-Za-z]/g,
            spec => (spec === '%%' ? '%' : names[n] ? '{' + names[n++] + '}' : spec));
    }

    const out = [];
    const files = [];
    (function walkLua(dir) {
        for (const n of readdirSync(dir)) {
            const p = join(dir, n);
            if (statSync(p).isDirectory()) walkLua(p);
            else if (n.endsWith('.lua')) files.push(p);
        }
    })(join(ROOT, 'server'));
    // Banners are raised client-side too (a share landing while the phone is shut, say).
    (function walkLua(dir) {
        for (const n of readdirSync(dir)) {
            const p = join(dir, n);
            if (statSync(p).isDirectory()) walkLua(p);
            else if (n.endsWith('.lua')) files.push(p);
        }
    })(join(ROOT, 'client'));

    const FAIL = /(?:util\.)?fail\(\s*'([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+)'\s*,\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
    const INLINE = /messageKey\s*=\s*'([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+)'\s*,\s*message\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
    const BANNER = /\b(title|body)Key\s*=\s*'([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+)'\s*,\s*(title|body)\s*=\s*/g;
    const unquote = s => s.slice(1, -1).replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
    const lineOf = (src, i) => src.slice(0, i).split('\n').length;

    for (const f of files) {
        const src = readFileSync(f, 'utf8');
        for (const re of [FAIL, INLINE]) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(src))) {
                out.push({ key: m[1], fallback: unquote(m[2]), file: rel(f), line: lineOf(src, m.index) });
            }
        }

        BANNER.lastIndex = 0;
        let b;
        while ((b = BANNER.exec(src))) {
            if (b[1] !== b[3]) continue;
            const fallback = luaBanner(src, b.index + b[0].length, b[1]);
            if (fallback === null) continue;
            out.push({ key: b[2], fallback, file: rel(f), line: lineOf(src, b.index) });
        }
    }
    return out;
}

// Keys whose name is built at runtime, so no scanner can see them.
// Each entry names where the real list of ids lives.
function dynamicKeys() {
    const out = [];

    const appsLua = readFileSync(join(ROOT, 'configs', 'apps.lua'), 'utf8');
    const re = /id\s*=\s*'([^']+)'\s*,\s*label\s*=\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(appsLua))) {
        out.push({ key: `apps.${m[1]}`, fallback: m[2], file: 'configs/apps.lua', line: 0 });
    }

    const gallery = readFileSync(join(SRC, 'shell', 'widgets', 'WidgetGallery.tsx'), 'utf8');
    for (const [group, constName] of [['size', 'SIZE_LABEL'], ['align', 'ALIGN_LABEL'], ['theme', 'THEME_LABEL']]) {
        const decl = gallery.match(new RegExp(`const ${constName}[^=]*=\\s*\\{([^}]*)\\}`));
        if (!decl) continue;
        for (const pair of decl[1].split(',')) {
            const kv = pair.match(/(\w+)\s*:\s*'([^']*)'/);
            if (kv) out.push({ key: `widgets.${group}.${kv[1]}`, fallback: kv[2], file: 'web/src/shell/widgets/WidgetGallery.tsx', line: 0 });
        }
    }
    return out;
}

export function scanAll() {
    const calls = [];
    const dynamicSites = [];
    for (const f of walk(SRC)) {
        const r = scanFile(f);
        calls.push(...r.calls);
        dynamicSites.push(...r.dynamic);
    }
    calls.push(...dynamicKeys());
    calls.push(...luaKeys());

    const byKey = new Map();
    for (const c of calls) {
        if (!byKey.has(c.key)) byKey.set(c.key, []);
        byKey.get(c.key).push(c);
    }

    const collisions = [];
    for (const [key, sites] of byKey) {
        const values = [...new Set(sites.map(s => s.fallback))];
        if (values.length > 1) collisions.push({ key, values, sites });
    }

    // These three resolve a key supplied at runtime rather than declaring one: t() itself,
    // failText() resolving a server's messageKey, and the custom-app SDK bridge forwarding a
    // third-party app's own key. None of them is a source of catalogue keys.
    const RESOLVERS = ['web/src/i18n/index.ts', 'web/src/core/api.ts', 'web/src/shell/CustomAppFrame.tsx'];
    const undeclared = dynamicSites.filter(d =>
        !RESOLVERS.includes(d.file) &&
        !(d.prefix && [...byKey.keys()].some(k => k.startsWith(d.prefix))));

    return { calls, byKey, collisions, dynamicSites: undeclared };
}

// t() resolves against the catalogue that is live WHEN IT RUNS, and the catalogue is fetched
// after boot. So a module-scope `const LABEL = { a: t(...) }` captures English once at import
// and never updates - not when the catalogue lands, not when the player switches language.
// The string is correctly wrapped, which is why it looks done; it is still permanently English.
// The fix at each site is to make it a function so it is evaluated per render.
function frozenCalls() {
    const count = (s, re) => (s.match(re) || []).length;
    const out = [];
    for (const f of walk(SRC)) {
        const text = readFileSync(f, 'utf8');
        if (!text.includes("from '@/i18n'")) continue;
        const lines = text.split('\n');
        let depth = 0;
        for (let i = 0; i < lines.length; i++) {
            const ln = lines[i];
            if (depth === 0 && /^(export\s+)?const\s+[A-Za-z_$]/.test(ln)) {
                let j = i, buf = '', d2 = 0;
                do {
                    buf += lines[j];
                    d2 += count(lines[j], /[[{(]/g) - count(lines[j], /[\]})]/g);
                    j++;
                } while (d2 > 0 && j < lines.length && j - i < 120);
                const head = buf.slice(0, buf.indexOf('t(') + 1 || 200);
                const isFn = /=>|\bfunction\b/.test(head);
                const n = count(buf, /\bt\(\s*['"`]/g);
                if (n > 0 && !isFn) out.push({ file: rel(f), line: i + 1, calls: n, name: (ln.match(/const\s+(\w+)/) || [])[1] });
            }
            depth += count(ln, /\{/g) - count(ln, /\}/g);
        }
    }
    return out;
}

const flatten = (obj, prefix = '', out = {}) => {
    for (const k of Object.keys(obj)) {
        const v = obj[k];
        const nk = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, nk, out);
        else out[nk] = String(v);
    }
    return out;
};

function nest(flat) {
    const root = {};
    for (const key of Object.keys(flat).sort()) {
        const parts = key.split('.');
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
            if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
            node = node[parts[i]];
        }
        node[parts[parts.length - 1]] = flat[key];
    }
    return root;
}

const readCatalogue = code => flatten(JSON.parse(readFileSync(join(LOCALES, `${code}.json`), 'utf8')));
const languages = () => readdirSync(LOCALES).filter(f => f.endsWith('.json') && f !== 'en.json').map(f => f.replace('.json', '')).sort();

function cmdGen() {
    const { byKey, collisions } = scanAll();
    if (collisions.length) {
        console.error(`Refusing to generate: ${collisions.length} key(s) have conflicting English text.`);
        console.error('Run "npm run i18n:check" for the list. Split them into separate keys first.');
        process.exit(1);
    }
    const flat = {};
    for (const [key, sites] of byKey) flat[key] = sites[0].fallback;

    const before = (() => { try { return readCatalogue('en'); } catch { return {}; } })();
    writeFileSync(join(LOCALES, 'en.json'), JSON.stringify(nest(flat), null, 2) + '\n', 'utf8');

    const keys = Object.keys(flat);
    const added   = keys.filter(k => !(k in before));
    const removed = Object.keys(before).filter(k => !(k in flat));
    const changed = keys.filter(k => k in before && before[k] !== flat[k]);
    console.log(`locales/en.json: ${keys.length} keys (+${added.length} new, -${removed.length} dead, ~${changed.length} retext)`);
    for (const k of added.slice(0, 20))   console.log(`  + ${k}`);
    if (added.length > 20) console.log(`  + ... ${added.length - 20} more`);
    for (const k of removed.slice(0, 20)) console.log(`  - ${k}`);
    if (removed.length > 20) console.log(`  - ... ${removed.length - 20} more`);
}

function cmdCheck() {
    const { byKey, collisions, dynamicSites } = scanAll();
    let bad = 0;

    if (collisions.length) {
        bad += collisions.length;
        console.error(`\n${collisions.length} key(s) used with conflicting English text.`);
        console.error('In English each site shows its own fallback, so this is invisible until you switch language.');
        for (const c of collisions) {
            console.error(`\n  ${c.key}`);
            for (const v of c.values) console.error(`      ${JSON.stringify(v)}`);
            for (const s of c.sites) console.error(`      at ${s.file}:${s.line}`);
        }
    }

    if (dynamicSites.length) {
        bad += dynamicSites.length;
        console.error(`\n${dynamicSites.length} t() call(s) build their key at runtime and are not declared in dynamicKeys():`);
        for (const d of dynamicSites) console.error(`  ${d.file}:${d.line}`);
    }

    const frozen = frozenCalls();
    if (frozen.length) {
        bad += frozen.length;
        const n = frozen.reduce((s, f) => s + f.calls, 0);
        console.error(`\n${frozen.length} module-scope constant(s) call t() at import time (${n} strings).`);
        console.error('These freeze to English at boot and never follow a language change. Make each one a function.');
        for (const f of frozen) console.error(`  ${String(f.calls).padStart(3)}  ${f.file}:${f.line}  ${f.name}`);
    }

    let en;
    try { en = readCatalogue('en'); } catch { en = null; }
    if (en) {
        const missing = [...byKey.keys()].filter(k => !(k in en));
        const stale   = Object.keys(en).filter(k => !byKey.has(k));
        const drift   = [...byKey.keys()].filter(k => k in en && en[k] !== byKey.get(k)[0].fallback);
        if (missing.length || stale.length || drift.length) {
            bad += missing.length + stale.length + drift.length;
            console.error(`\nlocales/en.json is out of date: ${missing.length} missing, ${stale.length} stale, ${drift.length} retexted.`);
            console.error('Run "npm run i18n:gen" to regenerate it.');
        }
    } else {
        bad++;
        console.error('\nlocales/en.json is missing. Run "npm run i18n:gen".');
    }

    // A translation that drops or renames a {placeholder} renders the raw span to the player,
    // so every catalogue value must carry exactly the same set as its English source.
    if (en) {
        const spans = s => (s.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || []).sort().join(',');
        for (const code of languages()) {
            let cat;
            try { cat = readCatalogue(code); } catch { continue; }
            const broken = Object.keys(cat).filter(k => k in en && spans(cat[k]) !== spans(en[k]));
            if (broken.length) {
                bad += broken.length;
                console.error(`\n${code}: ${broken.length} value(s) with mismatched {placeholders}:`);
                for (const k of broken.slice(0, 10)) {
                    console.error(`  ${k}\n      en: ${JSON.stringify(en[k])}\n      ${code}: ${JSON.stringify(cat[k])}`);
                }
                if (broken.length > 10) console.error(`  ... ${broken.length - 10} more`);
            }
        }
    }

    if (bad) { console.error(`\ni18n check failed with ${bad} problem(s).`); process.exit(1); }
    console.log(`i18n check passed: ${byKey.size} keys, no collisions, en.json in sync, placeholders intact.`);
}

function cmdStatus() {
    const en = readCatalogue('en');
    const total = Object.keys(en).length;
    const rows = [];
    for (const code of languages()) {
        const cat = readCatalogue(code);
        const missing = Object.keys(en).filter(k => !(k in cat));
        const identical = Object.keys(en).filter(k => k in cat && cat[k] === en[k]);
        const stale = Object.keys(cat).filter(k => !(k in en));
        rows.push({ code, have: total - missing.length, missing: missing.length, identical: identical.length, stale: stale.length });
    }
    rows.sort((a, b) => a.missing - b.missing || a.code.localeCompare(b.code));
    console.log(`English keys: ${total}\n`);
    console.log('lang   coverage   missing  identical  stale');
    for (const r of rows) {
        const pct = ((r.have / total) * 100).toFixed(1).padStart(5);
        console.log(`${r.code.padEnd(4)}   ${pct}%   ${String(r.missing).padStart(7)}  ${String(r.identical).padStart(9)}  ${String(r.stale).padStart(5)}`);
    }
}

// Writes locales/<code>.json for every language, dropping stale keys and keeping
// existing translations. Used after a rename so no translation is lost.
function cmdPrune() {
    const en = readCatalogue('en');
    for (const code of languages()) {
        const cat = readCatalogue(code);
        const kept = {};
        for (const k of Object.keys(cat)) if (k in en) kept[k] = cat[k];
        const dropped = Object.keys(cat).length - Object.keys(kept).length;
        writeFileSync(join(LOCALES, `${code}.json`), JSON.stringify(nest(kept), null, 2) + '\n', 'utf8');
        if (dropped) console.log(`${code}: dropped ${dropped} stale key(s)`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const cmd = process.argv[2];
    if (cmd === 'gen') cmdGen();
    else if (cmd === 'check') cmdCheck();
    else if (cmd === 'status') cmdStatus();
    else if (cmd === 'prune') cmdPrune();
    else { console.error('usage: node scripts/i18n.mjs <gen|check|status|prune>'); process.exit(1); }
}
