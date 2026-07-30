// String guard: keeps sd-phone's player-facing copy its own.
//
// sd-phone ships an interop layer for another phone resource, so its public export, event and
// column names appear here on purpose (see CONTRIBUTING.md). Its player-facing sentences must not.
// This check fails CI when one of them turns up in our UI text or in a t() key name, whether
// somebody pasted it in, an editor autocompleted it, or a translator worked from the wrong source.
//
// string-guard-hashes.json holds SHA-256 hashes of normalised sentences, never the sentences. That
// is deliberate and not negotiable: a plain-text list would park that resource's text permanently
// in the one file everybody reads. Hashes match exactly and cannot be read back into prose.
//
// Two independent checks run:
//   1. sentence check  - every string literal in our source, and every leaf in locales/en.json,
//      normalised and hashed against the sentence set.
//   2. key check       - every t() key leaf name, camelCase split back into words, hashed against
//      the identifier-form set. A key name can go on spelling out a sentence long after the value
//      it names has been rewritten, which no reviewer catches by eye.
//
// Only candidates of MIN_WORDS or more words are considered. Below that, agreement with any
// commercial phone UI is convergence: "Sign Out" and "Open in Maps" are Apple's words and every
// phone on the platform uses them. Flagging those would make the guard cry wolf, and a guard that
// cries wolf gets switched off.
//
// Usage:
//   node scripts/string-guard.mjs                    check, exit 1 on any hit
//   node scripts/string-guard.mjs --show-allowlisted  print the allowlisted strings, read out of
//                                                     OUR source, so the allowlist can be reviewed
//                                                     without the hash set leaking
//
// To rebuild the hash set, see howToRegenerate in string-guard-hashes.json.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

export const MIN_WORDS = 4;

// Files scanned for string literals. Globs are resolved by walk(), not by a glob library.
const SCAN = [
    { dir: 'web/src', ext: ['.ts', '.tsx'] },
    { dir: 'server', ext: ['.lua'] },
    { dir: 'client', ext: ['.lua'] },
    { dir: 'configs', ext: ['.lua'], flat: true },
    { dir: 'shared', ext: ['.lua'] },
    { dir: 'bridge', ext: ['.lua'] }
];

const SKIP_DIRS = new Set(['node_modules', 'build', 'build-demo', '.git', 'docs', 'dist']);

const isTest = (name) => /\.test\.[cm]?[jt]sx?$/.test(name);

// Hashes read by hand and judged convergent: the words any iOS-styled phone would use. Each needs
// a reason. The strings themselves stay out of this file for the same reason the hash set does; run
// with --show-allowlisted to read them back out of our own source.
export const ALLOWLIST = new Set([
    // web/src/apps/photogram/feed/PostCard.tsx - empty-comment-list prompt. Standard social-app
    // empty state which we keep verbatim on purpose.
    '481ccaa52dbad392ca1483201750656531571940a368b50da3b99a8c521d1814',
    // web/src/apps/photos/Photos.tsx - new-album name prompt. Platform-standard iOS Photos
    // wording which we keep verbatim on purpose.
    '49db0ab60e202e8fadafddd72ea66bd83f56c8a771e37dca990dd69f38609cf9',
    // web/src/apps/settings/sound/SoundHapticsPage.tsx - section header. Apple's own Settings
    // label; every iOS-styled phone ships it verbatim.
    '92df54856c5612e5e3ace5579c1a0ede78f000c04d3087e6f786696435ae601c',
    // web/src/apps/settings/sound/SoundHapticsPage.tsx - section header. Apple's own Settings
    // label; every iOS-styled phone ships it verbatim.
    '2e530859053542e1c6a56749edc9f1e5f12f53def6be1f6605dbb8b5ca5c2f24',
    // server/contacts/actions.lua - callback failure message. "Failed to <verb> <noun>" is the
    // generic error idiom, four words with no authored voice in them, same family as the other
    // generic system phrasing left alone on purpose.
    '29811de485a2346739cf2ee052bbb22d90c94fe627ef1e4c52f4b58f50173a2f'
]);

export function sha256(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

// Sentence form. Keep this and normalizeIdentifier byte-identical between the generator and the
// checker or the whole tool silently stops matching.
//
// curly quotes unified with straight, en/em dashes with the hyphen, the ellipsis character with
// three dots, every {placeholder} / {{placeholder}} / %s collapsed to a bare {}, whitespace
// collapsed, lowercased, trailing sentence punctuation dropped.
//
// Placeholders collapse rather than disappear: a sentence that differs only in what its
// placeholder is called is the same sentence, but a sentence with a placeholder removed is a
// different, shorter sentence and must not match it.
export function normalizeSentence(raw) {
    return String(raw)
        .replace(/[‘’ʼ′]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, '-')
        .replace(/…/g, '...')
        .replace(/\{\{[^{}]*\}\}/g, '{}')
        .replace(/\{[^{}]*\}/g, '{}')
        .replace(/%(?:\d+\$)?[-+ #0]*\d*(?:\.\d+)?[sdqfxX]/g, '{}')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/[\s.!?:;,]+$/, '')
        .trim();
}

// Identifier form, for the key check. Same unification, then placeholders unwrap to their bare
// name, apostrophes vanish (so "don't" and dontShowAgain agree) and every other non-alphanumeric
// becomes a space. A key name carries no punctuation, so the sentence it fossilises must be
// stripped of punctuation before the two can be compared.
export function normalizeIdentifier(raw) {
    return String(raw)
        .replace(/[‘’ʼ′]/g, "'")
        .replace(/\{\{?([^{}]*?)\}?\}/g, ' $1 ')
        .replace(/%(?:\d+\$)?[-+ #0]*\d*(?:\.\d+)?[sdqfxX]/g, ' ')
        .replace(/'/g, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

export function splitCamel(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-zA-Z])([0-9])/g, '$1 $2');
}

export function wordCount(normalized) {
    return normalized ? normalized.split(' ').length : 0;
}

// null when the candidate is too short to be evidence of anything.
export function sentenceEntry(raw) {
    const norm = normalizeSentence(raw);
    const words = wordCount(norm);
    if (words < MIN_WORDS) return null;
    return { h: sha256(norm), w: words, c: norm.slice(0, 1) };
}

export function identifierEntry(raw) {
    const norm = normalizeIdentifier(raw);
    const words = wordCount(norm);
    if (words < MIN_WORDS) return null;
    return { h: sha256(norm), w: words, c: norm.slice(0, 1) };
}

const ESCAPES = { n: '\n', r: '\r', t: '\t', v: '\v', f: '\f', b: '\b', 0: '\0' };

export function unescapeLiteral(text) {
    return text
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\([nrtvfb0])/g, (_, c) => ESCAPES[c])
        .replace(/\\(.)/g, '$1');
}

const JS_LITERAL = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.|\$(?!\{))*)`/g;
const LUA_LITERAL = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
const JSX_TEXT = />([^<>{}]+)</g;
const T_KEY = /\bt\(\s*(['"])([A-Za-z0-9_.\-]+)\1/g;

// Literals are matched a line at a time. Multi-line template literals and multi-line Lua long
// strings are therefore not covered; player copy in this repo is never written that way.
export function literalsInLine(line, kind) {
    const out = [];
    const re = kind === 'lua' ? LUA_LITERAL : JS_LITERAL;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
        const body = m[1] ?? m[2] ?? m[3] ?? '';
        if (body) out.push(unescapeLiteral(body));
        if (m.index === re.lastIndex) re.lastIndex += 1;
    }
    if (kind === 'tsx') {
        JSX_TEXT.lastIndex = 0;
        let j;
        while ((j = JSX_TEXT.exec(line)) !== null) {
            const text = j[1].trim();
            if (text && /[a-zA-Z]/.test(text)) out.push(text);
            JSX_TEXT.lastIndex = j.index + 1;
        }
    }
    return out;
}

export function keysInLine(line) {
    const out = [];
    T_KEY.lastIndex = 0;
    let m;
    while ((m = T_KEY.exec(line)) !== null) out.push(m[2]);
    return out;
}

export function jsonLeaves(node, trail = [], out = []) {
    if (typeof node === 'string') {
        out.push({ key: trail[trail.length - 1] ?? '', path: trail.join('.'), value: node });
    } else if (Array.isArray(node)) {
        node.forEach((v, i) => jsonLeaves(v, trail.concat(String(i)), out));
    } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) jsonLeaves(v, trail.concat(k), out);
    }
    return out;
}

export function walk(dir, exts, flat = false, out = []) {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) {
            if (!flat && !SKIP_DIRS.has(name)) walk(full, exts, false, out);
        } else if (exts.includes(path.extname(name)) && !isTest(name)) {
            out.push(full);
        }
    }
    return out;
}

const rel = (full) => path.relative(REPO, full).split(path.sep).join('/');

function loadDenylist() {
    const file = path.join(HERE, 'string-guard-hashes.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const sentences = new Map();
    const keys = new Map();
    for (const e of data.hashes) sentences.set(e.h, e);
    for (const e of data.keyHashes) keys.set(e.h, e);
    return { data, sentences, keys };
}

function collectCandidates() {
    const strings = [];
    const keys = [];

    const enJson = path.join(REPO, 'locales', 'en.json');
    if (existsSync(enJson)) {
        const raw = readFileSync(enJson, 'utf8');
        const lines = raw.split(/\r?\n/);
        // Leaves come out in file order, so a forward-only cursor gives the right line even where
        // the same leaf name repeats in several namespaces.
        let cursor = 0;
        for (const leaf of jsonLeaves(JSON.parse(raw))) {
            const needle = `"${leaf.key}":`;
            let at = lines.findIndex((l, i) => i >= cursor && l.includes(needle));
            if (at < 0) at = lines.findIndex((l) => l.includes(needle));
            if (at >= 0) cursor = at + 1;
            const line = at >= 0 ? at + 1 : 0;
            strings.push({ file: 'locales/en.json', line, text: leaf.value });
            keys.push({ file: 'locales/en.json', line, key: leaf.path });
        }
    }

    for (const spec of SCAN) {
        for (const full of walk(path.join(REPO, spec.dir), spec.ext, spec.flat)) {
            const ext = path.extname(full);
            const kind = ext === '.lua' ? 'lua' : ext === '.tsx' ? 'tsx' : 'ts';
            const lines = readFileSync(full, 'utf8').split(/\r?\n/);
            lines.forEach((line, i) => {
                for (const text of literalsInLine(line, kind)) {
                    strings.push({ file: rel(full), line: i + 1, text });
                }
                if (kind !== 'lua') {
                    for (const key of keysInLine(line)) {
                        keys.push({ file: rel(full), line: i + 1, key });
                    }
                }
            });
        }
    }

    return { strings, keys };
}

function shorten(text) {
    const flat = String(text).replace(/\s+/g, ' ').trim();
    return flat.length > 110 ? `${flat.slice(0, 107)}...` : flat;
}

function main() {
    const showAllowlisted = process.argv.includes('--show-allowlisted');
    const { data, sentences, keys } = loadDenylist();
    const { strings, keys: keyRefs } = collectCandidates();

    const hits = [];
    const allowed = [];
    const seen = new Set();
    let eligible = 0;

    for (const cand of strings) {
        const entry = sentenceEntry(cand.text);
        if (entry) eligible += 1;
        if (!entry || !sentences.has(entry.h)) continue;
        const dedupe = `s:${entry.h}:${cand.file}:${cand.line}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        (ALLOWLIST.has(entry.h) ? allowed : hits).push({ kind: 'sentence', ...cand, hash: entry.h });
    }

    for (const cand of keyRefs) {
        const leaf = cand.key.split('.').pop() ?? '';
        const entry = identifierEntry(splitCamel(leaf));
        if (entry) eligible += 1;
        if (!entry || !keys.has(entry.h)) continue;
        const dedupe = `k:${entry.h}:${cand.file}:${cand.line}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        (ALLOWLIST.has(entry.h) ? allowed : hits).push({
            kind: 'key',
            file: cand.file,
            line: cand.line,
            text: cand.key,
            hash: entry.h
        });
    }

    if (showAllowlisted) {
        console.log(`allowlisted matches, as they appear in our source (${allowed.length}):`);
        for (const a of allowed) console.log(`  ${a.file}:${a.line}  [${a.kind}]  ${shorten(a.text)}`);
        const live = new Set(allowed.map((a) => a.hash));
        for (const h of ALLOWLIST) {
            if (!live.has(h)) console.log(`  stale allowlist entry, nothing matches it: ${h}`);
        }
    }

    const extracted = strings.length + keyRefs.length;

    if (hits.length > 0) {
        console.error(
            `string guard: ${hits.length} string(s) match a sentence from ${data.referenceSet}.\n` +
                'Rewrite them. Change the shape of the sentence, not just the words. If the match is\n' +
                'genuine convergence (a platform-standard label, a generic system message), add its\n' +
                'hash to ALLOWLIST in scripts/string-guard.mjs with a one-line reason.\n'
        );
        for (const hit of hits) {
            const what = hit.kind === 'key' ? 'key name spells out one of those sentences' : 'string matches';
            console.error(`  ${hit.file}:${hit.line}\n    ${what}: ${shorten(hit.text)}\n    hash: ${hit.hash}`);
        }
        process.exit(1);
    }

    console.log(
        `string guard: clean. ${eligible} of ${extracted} strings and t() keys were ` +
            `${MIN_WORDS}+ words and were checked against ${sentences.size} sentence + ` +
            `${keys.size} key hashes from ${data.referenceSet}` +
            (allowed.length ? `; ${allowed.length} allowlisted match(es)` : '') +
            '.'
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
