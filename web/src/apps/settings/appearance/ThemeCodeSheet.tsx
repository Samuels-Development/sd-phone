import { Check, Copy } from 'lucide-react';

import { t } from '@/i18n';
import { useCopied } from '@/hooks/useCopied';
import { Sheet } from '@/ui/Sheet';

export function ThemeCodeSheet({ code, onClose }: { code: string; onClose: () => void }) {
    const [copied, copy] = useCopied();

    return (
        <Sheet
            onClose={onClose}
            fit="content"
            title={t('settings.iconThemeCode', 'Theme Code')}
            className="bg-base"
        >
            {() => (
                <div className="px-4 pb-2 pt-1">
                    <p className="pb-4 text-[13px] leading-snug text-ios-gray">
                        {t('settings.iconThemeCodeHint', 'Anyone can paste this code into App Icons to get a copy of this theme. Importing never overwrites a theme they already have.')}
                    </p>

                    <div className="max-h-[168px] overflow-y-auto rounded-[12px] bg-surface px-3 py-3 no-scrollbar">
                        <code className="block break-all font-mono text-[12px] leading-[1.45] text-black dark:text-white">
                            {code}
                        </code>
                    </div>

                    <button
                        type="button"
                        onClick={() => copy(code)}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[12px] bg-ios-blue py-3 text-[17px] font-semibold text-white active:opacity-80"
                    >
                        {copied
                            ? <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
                            : <Copy className="h-[17px] w-[17px]" strokeWidth={2.2} />}
                        {copied ? t('common.copied', 'Copied') : t('settings.iconThemeCopyCode', 'Copy Code')}
                    </button>
                </div>
            )}
        </Sheet>
    );
}
