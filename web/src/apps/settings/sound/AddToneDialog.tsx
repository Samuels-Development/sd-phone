import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { DialogShell } from '@/ui/DialogShell';
import { fetchYouTubeMeta, isYouTube } from '@/apps/music/data';


interface Props {
    title:     string;
    message:   string;
    onCancel:  () => void;
    onConfirm: (name: string, url: string) => void;
}

export function AddToneDialog({ title, message, onCancel, onConfirm }: Props) {
    const [name, setName]       = useState('');
    const [url, setUrl]         = useState('');
    const [exiting, setExiting] = useState(false);
    const urlRef = useRef<HTMLInputElement>(null);

    const trimmedUrl = url.trim();
    const urlValid   = trimmedUrl.length > 0 && isYouTube(trimmedUrl);
    const canConfirm = name.trim().length > 0 && urlValid;

    useEffect(() => { urlRef.current?.focus(); }, []);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') { e.stopPropagation(); dismiss(onCancel); }
        }
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onCancel]);

    useEffect(() => {
        if (!urlValid || name.trim()) return;
        let active = true;
        void fetchYouTubeMeta(trimmedUrl).then(meta => {
            if (active) setName(prev => (prev.trim() ? prev : meta.title));
        });
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trimmedUrl, urlValid]);

    function dismiss(after: () => void) {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(after, 180);
    }

    function confirm() {
        if (!canConfirm) return;
        dismiss(() => onConfirm(name.trim(), trimmedUrl));
    }

    const inputCls =
        'w-full rounded-[9px] border border-black/15 bg-elevated px-3 py-2 text-[16px] text-black outline-none focus:border-ios-blue dark:border-white/20 dark:bg-base/40 dark:text-white';

    return (
        <DialogShell
            title={title}
            message={message}
            exiting={exiting}
            cancel={{ label: t('settings.cancel', 'Cancel'), onClick: () => dismiss(onCancel) }}
            confirm={{ label: t('settings.add', 'Add'), onClick: confirm, disabled: !canConfirm }}
        >
            <input
                value={name}
                maxLength={64}
                placeholder={t('settings.name', 'Name')}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); confirm(); } }}
                className={`mt-4 ${inputCls}`}
            />
            <input
                ref={urlRef}
                value={url}
                placeholder={t('settings.youtubeLink', 'YouTube link')}
                inputMode="url"
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); confirm(); } }}
                className={`mt-2 ${inputCls}`}
            />
            {trimmedUrl.length > 0 && !urlValid && (
                <div className="mt-1.5 text-left text-[13px] text-ios-red">
                    {t('settings.enterValidYoutube', 'Enter a valid YouTube link.')}
                </div>
            )}
        </DialogShell>
    );
}
