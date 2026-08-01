import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ShieldAlert } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { NavContext } from '@/hooks/useIosPush';
import type { DepartmentType, MdtSection } from './data';
import { CasesPane } from './CasesPane';
import { ChatPane } from './ChatPane';
import { DepartmentSeal } from './DepartmentSeal';
import { DispatchPane } from './DispatchPane';
import { EmployeesPane } from './EmployeesPane';
import { HomePane } from './HomePane';
import { JailPane } from './JailPane';
import { LogsPane } from './LogsPane';
import { MdtHeader } from './MdtHeader';
import { MdtSidebar } from './MdtSidebar';
import { OffencesPane } from './OffencesPane';
import { PatientsPane } from './PatientsPane';
import { ProfilesPane } from './ProfilesPane';
import { ProtocolsPane } from './ProtocolsPane';
import { ReportsPane } from './ReportsPane';
import { VehiclesPane } from './VehiclesPane';
import { WarrantsPane } from './WarrantsPane';
import { MDT_ACCENT, MDT_STATUS_RESERVE, mdtBackdrop } from './mdtTheme';
import { MdtSessionProvider, useMdtSession, useMdtSessionState } from './useMdtSession';

function pane(section: MdtSection) {
    switch (section) {
        case 'dispatch':  return <DispatchPane />;
        case 'profiles':  return <ProfilesPane />;
        case 'vehicles':  return <VehiclesPane />;
        case 'reports':   return <ReportsPane />;
        case 'cases':     return <CasesPane />;
        case 'warrants':  return <WarrantsPane />;
        case 'offences':  return <OffencesPane />;
        case 'employees': return <EmployeesPane />;
        case 'chat':      return <ChatPane />;
        case 'jail':      return <JailPane />;
        case 'logs':      return <LogsPane />;
        case 'patients':  return <PatientsPane />;
        case 'protocols': return <ProtocolsPane />;
        default:          return <HomePane />;
    }
}

const COMPACT_WIDTH = 900;

function MdtTerminal() {
    const { ready, me, department, section, canOpen } = useMdtSession();

    const accent = department?.accent ?? MDT_ACCENT;
    const signedIn = ready && !!me && !!department;

    const active: MdtSection = section !== 'home' && !canOpen(section) ? 'home' : section;

    const rootRef = useRef<HTMLDivElement>(null);
    const [compact, setCompact] = useState(false);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const measure = () => setCompact(el.clientWidth < COMPACT_WIDTH);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            ref={rootRef}
            data-mdt-root=""
            className={`absolute inset-0 z-10 flex select-none flex-col font-sf text-black dark:text-white ${mdtBackdrop}`}
            style={{ '--mdt-accent': accent } as CSSProperties}
        >
            <div className="shrink-0" style={{ height: MDT_STATUS_RESERVE }} />

            {!ready ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                    <DepartmentSeal accent={accent} size={72} className="animate-pulse opacity-30" />
                </div>
            ) : !signedIn ? (
                <div className="flex min-h-0 flex-1 items-center justify-center px-10">
                    <EmptyState
                        center
                        icon={ShieldAlert}
                        title={t('mdt.lockedTitle', 'Terminal Locked')}
                        subtitle={t('mdt.lockedSub', 'This terminal is issued to sworn personnel. Come on duty with a department that carries MDT access to sign in.')}
                    />
                </div>
            ) : (
                <>
                    <MdtHeader compact={compact} />
                    <div className="flex min-h-0 flex-1">
                        <MdtSidebar compact={compact} />
                        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col pb-6">
                            <div key={active} className="flex min-h-0 flex-1 flex-col animate-mdt-pane">
                                {pane(active)}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function Terminal({ devDomain }: { devDomain?: DepartmentType }) {
    const session = useMdtSessionState(devDomain);
    return (
        <MdtSessionProvider value={session}>
            <NavContext.Provider value={{ onWillBack: () => {} }}>
                <MdtTerminal />
            </NavContext.Provider>
        </MdtSessionProvider>
    );
}

export function Mdt({ onClose: _onClose }: { onClose: () => void }) {
    return <Terminal />;
}

export function EmsMdt({ onClose: _onClose }: { onClose: () => void }) {
    return <Terminal devDomain="ems" />;
}
