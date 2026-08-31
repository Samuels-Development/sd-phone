import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { NavBar } from '@/ui/NavBar';
import { PushLayer } from '@/shell/PushLayer';
import { useIosPush } from '@/hooks/useIosPush';

export { PushLayer } from '@/shell/PushLayer';

interface PageProps {
    title:      string;
    backLabel?: string;
    onBack:     () => void;
    sub?:       ReactNode;
    children:   ReactNode;
}

export function SubPage({ title, backLabel = t('settings.general', 'General'), onBack, sub, children }: PageProps) {
    const { goBack, pageStyle } = useIosPush(onBack);
    return (
        <PushLayer pageStyle={pageStyle} className="z-20" sub={sub}>
            <div className="h-11 shrink-0" aria-hidden />
            <NavBar backLabel={backLabel} onBack={goBack} title={title} hairline />
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-6 pb-10">
                    {children}
                </div>
            </div>
        </PushLayer>
    );
}
