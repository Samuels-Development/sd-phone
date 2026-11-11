// A bounded range read: verifying a direct upload must never download a whole recording.
(() => {
    const https = require('node:https');
    const registerExport = typeof exports === 'function' ? exports : global.exports;
    const HEAD_BYTES = 12;

    registerExport('sdMediaProbeReady', () => true);
    registerExport('sdMediaProbe', (ticket, url) => {
        let settled = false;
        const finish = (result, code) => {
            if (settled) return;
            settled = true;
            const send = typeof emit === 'function' ? emit : TriggerEvent;
            send('sd-phone:server:media:probed', String(ticket), result, code);
        };
        let parsed;
        try { parsed = new URL(url); } catch { finish(null, 'probe-failed'); return true; }
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.hash) {
            finish(null, 'probe-failed');
            return true;
        }

        const req = https.request(parsed, {
            method: 'GET',
            headers: { Range: `bytes=0-${HEAD_BYTES - 1}`, 'Accept-Encoding': 'identity' },
        }, (res) => {
            const range = /^bytes 0-(\d+)\/(\d+)$/.exec(res.headers['content-range'] || '');
            const total = range ? Number(range[2]) : 0;
            const end = range ? Number(range[1]) : -1;
            const mime = String(res.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
            if (res.statusCode !== 206 || !Number.isSafeInteger(total) || total < HEAD_BYTES
                || end !== HEAD_BYTES - 1 || res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
                finish(null, 'probe-failed');
                res.destroy();
                return;
            }

            const chunks = [];
            let received = 0;
            res.on('data', (chunk) => {
                received += chunk.length;
                if (received > HEAD_BYTES) {
                    finish(null, 'probe-failed');
                    res.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            res.on('end', () => {
                if (received !== HEAD_BYTES) return finish(null, 'probe-failed');
                finish({ bytes: total, mime, head: Buffer.concat(chunks).toString('base64') }, null);
            });
            res.on('error', () => finish(null, 'probe-failed'));
            res.on('aborted', () => finish(null, 'probe-failed'));
        });
        // A wall-clock deadline also covers a peer that trickles bytes to avoid an idle timeout.
        const timer = setTimeout(() => {
            finish(null, 'probe-failed');
            req.destroy();
        }, 10000);
        req.on('close', () => {
            clearTimeout(timer);
            finish(null, 'probe-failed');
        });
        req.on('error', () => finish(null, 'probe-failed'));
        req.end();
        return true;
    });
})();
