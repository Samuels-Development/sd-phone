import { useState } from 'react';
import type { ReactNode } from 'react';
import { Building2, MessageSquare, Navigation, Phone } from 'lucide-react';

import { device } from '@device';
import { ActionSheet } from '@/ui/ActionSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { PromptDialog } from '@/ui/PromptDialog';
import { requestOpenMaps } from '@/shell/deeplink';
import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { ServiceAvatar } from './ServiceAvatar';
import { type Company } from './data';
import { callCompany, messageCompany } from './servicesApi';
import { failText } from '@/core/api';

export function CompaniesTab({ companies, onMessaged }: { companies: Company[]; onMessaged?: () => void }) {
    const [msgTo, setMsgTo] = useState<Company | null>(null);
    const [locateFor, setLocateFor] = useState<Company | null>(null);
    const [error, setError] = useState<string | null>(null);

    function locate(c: Company) {
        if (!c.coords) { setError(t('services.noLocationSet', 'No location set for this company.')); return; }
        setLocateFor(c);
    }

    function setWaypoint(c: Company) {
        if (c.coords && isFiveM) void fetchNui('sd-phone:maps:waypoint', { x: c.coords.x, y: c.coords.y });
    }

    function openInMaps(c: Company) {
        if (!c.coords) return;
        requestOpenMaps({ label: c.name, x: c.coords.x, y: c.coords.y, color: c.color, companyId: c.id });
    }

    async function call(c: Company) {
        const res = await callCompany(c.id);
        if (!res.success) setError(failText(res, t('services.couldntCall', "Couldn't place the call.")));
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <h1 className="px-5 pb-2 pt-1 text-[34px] font-bold tracking-tight text-black dark:text-white">{t('services.companies', 'Companies')}</h1>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
                {companies.length === 0 ? (
                    <EmptyState icon={Building2} title={t('services.noCompanies', 'No Companies')} subtitle={t('services.noCompaniesToShow', 'There are no companies to show.')} />
                ) : (
                    <div className="flex flex-col gap-3">
                        {companies.map(c => (
                            <CompanyCard
                                key={c.id}
                                company={c}
                                onLocate={() => locate(c)}
                                onCall={() => void call(c)}
                                onMessage={() => setMsgTo(c)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {msgTo && (
                <PromptDialog
                    title={t('services.messageName', 'Message {name}', { name: msgTo.name })}
                    placeholder={t('services.typeAMessage', 'Type a message…')}
                    confirmLabel={t('services.send', 'Send')}
                    maxLength={300}
                    onCancel={() => setMsgTo(null)}
                    onConfirm={body => {
                        const company = msgTo;
                        setMsgTo(null);
                        const text = body.trim();
                        if (!text) return;
                        void messageCompany(company.id, { kind: 'text', body: text }).then(inbox => {
                            if (inbox) onMessaged?.();
                            else setError(t('services.couldntSend', "Couldn't send your message."));
                        });
                    }}
                />
            )}

            {locateFor && (
                <ActionSheet
                    actions={[
                        { label: t('services.setWaypoint', 'Set Waypoint'), onClick: () => setWaypoint(locateFor) },
                        { label: t('services.openInMaps', 'Open in Maps'), onClick: () => openInMaps(locateFor) },
                    ]}
                    onClose={() => setLocateFor(null)}
                />
            )}

            {error && (
                <AlertDialog
                    title={t('services.couldntComplete', "Couldn't complete that")}
                    message={error}
                    confirmLabel={t('services.ok', 'OK')}
                    hideCancel
                    onCancel={() => setError(null)}
                    onConfirm={() => setError(null)}
                />
            )}
        </div>
    );
}

function CompanyCard({ company, onLocate, onCall, onMessage }: {
    company: Company;
    onLocate: () => void;
    onCall: () => void;
    onMessage: () => void;
}) {
    return (
        <div className="flex items-center gap-4 rounded-[16px] bg-surface px-4 py-4">
            <div className="relative shrink-0">
                <ServiceAvatar color={company.color} emoji={company.emoji} size={58} />
                <span
                    aria-label={company.onDuty
                        ? t('services.dutyOpen', 'Staff on duty')
                        : t('services.dutyClosed', 'Nobody on duty')}
                    title={company.onDuty
                        ? t('services.dutyOpen', 'Staff on duty')
                        : t('services.dutyClosed', 'Nobody on duty')}
                    className={`absolute -right-px -top-px h-[15px] w-[15px] rounded-full ring-[3px] ring-surface ${
                        company.onDuty ? 'bg-[#34c759]' : 'bg-[#ff3b30]'
                    }`}
                />
            </div>

            <div className="min-w-0 flex-1">

                <div className="truncate text-[20px] font-semibold text-black dark:text-white">{company.name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[15px] font-medium text-ios-gray">
                    <Building2 className="h-[15px] w-[15px] shrink-0 text-ios-gray" strokeWidth={2.2} />
                    <span className="truncate">{company.location}</span>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
                <ActionTile color="#FF9F0A" label={t('services.locateName', 'Locate {name}', { name: company.name })} onClick={onLocate}>
                    <Navigation className="h-[20px] w-[20px]" strokeWidth={2.2} fill="currentColor" />
                </ActionTile>
                {company.canCall && device.calls && (
                    <ActionTile color="#34C759" label={t('services.callName', 'Call {name}', { name: company.name })} onClick={onCall}>
                        <Phone className="h-[20px] w-[20px]" strokeWidth={2.2} fill="currentColor" />
                    </ActionTile>
                )}
                <ActionTile color="#0A84FF" label={t('services.messageName', 'Message {name}', { name: company.name })} onClick={onMessage}>
                    <MessageSquare className="h-[20px] w-[20px]" strokeWidth={2.2} fill="currentColor" />
                </ActionTile>
            </div>
        </div>
    );
}

function ActionTile({ color, label, onClick, children }: { color: string; label: string; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-[12px] text-white shadow-sm active:opacity-75"
            style={{ background: color }}
        >
            {children}
        </button>
    );
}
