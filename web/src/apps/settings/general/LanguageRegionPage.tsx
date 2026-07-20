import { useState } from 'react';
import { Check } from 'lucide-react';

import { t } from '@/i18n';
import { formatMediumDate } from '@/lib/time';
import { useIosPush } from '@/hooks/useIosPush';
import { SUPPORTED_LOCALES, useLocaleStore } from '@/stores/localeStore';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';
import { NavBar } from '@/ui/NavBar';

export function LanguageRegionPage({ onBack }: { onBack: () => void }) {
    const locale = useLocaleStore(s => s.locale);
    const setLocale = useLocaleStore(s => s.setLocale);
    const [picking, setPicking] = useState(false);

    const current = SUPPORTED_LOCALES.find(o => o.code === locale)?.name ?? 'English';

    const subNode = picking ? (
        <LanguagePickerPage
            selected={locale}
            onSelect={code => { setLocale(code); setPicking(false); }}
            onBack={() => setPicking(false)}
        />
    ) : null;

    return (
        <SubPage title={t('settings.languageRegion', 'Language & Region')} onBack={onBack} sub={subNode}>
            <ListGroup>
                <ListRow label={t('settings.language', 'Language')} value={current} onPress={() => setPicking(true)} divider />
                <ListRow label={t('settings.region', 'Region')}   value="United States" />
            </ListGroup>

            <ListGroup header={t('settings.regionFormats', 'Region formats')}>
                <ListRow label={t('settings.calendar', 'Calendar')}    value="Gregorian"  divider />
                <ListRow label={t('settings.temperature', 'Temperature')} value="°F"         divider />
                <ListRow label={t('settings.measurement', 'Measurement')} value="Imperial"   />
            </ListGroup>

            <ListGroup header={t('settings.numberFormats', 'Number formats')}>
                <ListRow label={t('settings.number', 'Number')}   value="1,234.56"          chevron={false} divider />
                <ListRow label={t('settings.currency', 'Currency')} value="USD ($)"           chevron={false} divider />
                <ListRow label={t('settings.date', 'Date')}     value={formatMediumDate(new Date())} chevron={false} divider />
                <ListRow label={t('settings.time', 'Time')}     value="8:22 PM"           chevron={false} />
            </ListGroup>
        </SubPage>
    );
}

function LanguagePickerPage({
    selected, onSelect, onBack,
}: {
    selected: string;
    onSelect: (code: string) => void;
    onBack:   () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] dark:bg-base" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />
            <NavBar backLabel={t('settings.languageRegion', 'Language & Region')} onBack={goBack} title={t('settings.language', 'Language')} hairline />
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-6 pb-10">
                    <ListGroup>
                        {SUPPORTED_LOCALES.map((opt, i) => (
                            <button
                                key={opt.code}
                                type="button"
                                onClick={() => onSelect(opt.code)}
                                className="relative flex w-full items-center px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                            >
                                <span className="flex-1 text-[17px] font-normal text-black dark:text-white">{opt.name}</span>
                                {opt.code === selected && (
                                    <Check className="h-[17px] w-[17px] shrink-0 text-ios-blue" strokeWidth={2.5} />
                                )}
                                {i < SUPPORTED_LOCALES.length - 1 && (
                                    <div
                                        className="pointer-events-none absolute bottom-0 right-0 bg-ios-gray4 dark:bg-control"
                                        style={{ left: 0, height: '0.5px' }}
                                    />
                                )}
                            </button>
                        ))}
                    </ListGroup>
                </div>
            </div>
        </div>
    );
}
