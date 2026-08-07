import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { NavBar } from '@/ui/NavBar';
import { Pill } from '@/ui/Pill';
import { MenuRootProvider } from '@/ui/menuRoot';
import { ContactAvatar } from '@/shared/ContactAvatar';
import { colorFor, initialsFor } from '@/lib/format';
import { useIosPush } from '@/hooks/useIosPush';
import { useSessionState } from '@/hooks/useSessionState';
import type { Department, MdtSection, Officer } from './data';
import { DepartmentSeal } from './DepartmentSeal';
import { MdtMenu } from './MdtMenu';
import { navItems } from './mdtNav';
import { MDT_ACCENT, MDT_STATUS_RESERVE, mdtBackdrop, mdtRuleX, mdtViewEnter } from './mdtTheme';
import { useMdtSession } from './useMdtSession';

function terminalName(type: Department['type']): string {
    if (type === 'ems') return t('mdt.terminalNameEms', 'Mobile Medical Terminal');
    if (type === 'doj') return t('mdt.terminalNameDoj', 'Court Records Terminal');
    return t('mdt.terminalName', 'Mobile Police Terminal');
}

function MdtPhoneHeader({ me, department, onOpenRecord }: {
    me:            Officer;
    department:    Department;
    onOpenRecord?: () => void;
}) {
    const avatar = (
        <span className="relative flex shrink-0">
            <ContactAvatar
                size={34}
                contact={{
                    name:     me.name,
                    initials: initialsFor(me.name),
                    color:    colorFor(me.citizenid),
                    avatar:   me.avatar,
                }}
            />
            <span
                aria-label={me.duty ? t('mdt.onDuty', 'On Duty') : t('mdt.offDuty', 'Off Duty')}
                className={`absolute -bottom-px -right-px h-[10px] w-[10px] rounded-full ring-2 ring-base ${me.duty ? 'bg-ios-green' : 'bg-ios-gray3'}`}
            />
        </span>
    );

    return (
        <div className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-0.5">
            <DepartmentSeal seal={department.seal} accent={department.accent || MDT_ACCENT} size={32} />

            <div className="flex min-w-0 flex-1 flex-col">
                <h1 className="min-w-0 truncate text-[17px] font-semibold leading-tight tracking-tight text-black dark:text-white">
                    {department.label || t('mdt.departmentFallback', 'Department Terminal')}
                </h1>
                <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.09em] text-ios-gray">
                    {terminalName(department.type)}
                </span>
            </div>

            {me.callsign && <Pill tone="green">{me.callsign}</Pill>}

            {onOpenRecord ? (
                <button
                    type="button"
                    onClick={onOpenRecord}
                    aria-label={t('mdt.openMyRecord', 'Open my personnel record')}
                    className="flex shrink-0 rounded-full transition-opacity duration-150 active:opacity-60"
                >
                    {avatar}
                </button>
            ) : avatar}
        </div>
    );
}

function MdtSectionPage({ section, title, backLabel, onBack, renderPane }: {
    section:    MdtSection;
    title:      string;
    backLabel:  string;
    onBack:     () => void;
    renderPane: (section: MdtSection) => ReactNode;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);

    return (
        <div className={`absolute inset-0 z-20 flex flex-col ${mdtBackdrop}`} style={pageStyle}>
            <div className="shrink-0" style={{ height: MDT_STATUS_RESERVE }} />

            <NavBar backLabel={backLabel} onBack={goBack} title={title} />

            <div
                key={section}
                className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${mdtViewEnter}`}
                style={{ paddingBottom: 'var(--safe-bottom)' }}
            >
                {renderPane(section)}
            </div>
        </div>
    );
}

export function MdtPhone({ renderPane }: { renderPane: (section: MdtSection) => ReactNode }) {
    const { ready, me, department, section, canOpen, open, select } = useMdtSession();

    const [pushed, setPushed] = useSessionState('mdt:phonePushed', false);
    const [root, setRoot]     = useState<HTMLDivElement | null>(null);

    const accent  = MDT_ACCENT;
    const catalog = navItems();
    const allowed = section === 'home' || canOpen(section);

    useEffect(() => {
        if (pushed && !allowed) setPushed(false);
    }, [pushed, allowed, setPushed]);

    const openSection = useCallback((target: MdtSection, ref?: string) => {
        open(target, ref);
        setPushed(true);
    }, [open, setPushed]);

    const closeSection = useCallback(() => {
        select(null);
        setPushed(false);
    }, [select, setPushed]);

    return (
        <MenuRootProvider value={root}>
        <div
            ref={setRoot}
            data-mdt-root=""
            className={`absolute inset-0 z-10 flex select-none flex-col font-sf text-black dark:text-white ${mdtBackdrop}`}
            style={{ '--mdt-accent': accent } as CSSProperties}
        >
            <div className="shrink-0" style={{ height: MDT_STATUS_RESERVE }} />

            {!ready ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                    <DepartmentSeal accent={accent} size={72} className="animate-pulse opacity-30" />
                </div>
            ) : !me || !department ? (
                <div className="flex min-h-0 flex-1 items-center justify-center px-7">
                    <EmptyState
                        center
                        icon={ShieldAlert}
                        title={t('mdt.lockedTitle', 'Terminal Locked')}
                        subtitle={t('mdt.lockedSub', 'This terminal is issued to sworn personnel. Come on duty with a department that carries MDT access to sign in.')}
                    />
                </div>
            ) : (
                <>
                    <MdtPhoneHeader
                        me={me}
                        department={department}
                        onOpenRecord={canOpen('employees')
                            ? () => openSection('employees', me.citizenid)
                            : undefined}
                    />

                    <div className={mdtRuleX} />

                    <MdtMenu onOpen={openSection} />

                    {pushed && allowed && (
                        <MdtSectionPage
                            section={section}
                            title={catalog[section].label}
                            backLabel={department.short || department.label}
                            onBack={closeSection}
                            renderPane={renderPane}
                        />
                    )}
                </>
            )}
        </div>
        </MenuRootProvider>
    );
}
