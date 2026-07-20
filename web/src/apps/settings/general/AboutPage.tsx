import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { formatPhone } from '@/lib/phone';
import { useContacts } from '@/stores/contactsStore';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';
import { OS_VERSION } from './SoftwareUpdatePage';

export function AboutPage({ onBack }: { onBack: () => void }) {
    const { myName, myNumber, card, load } = useContacts('myName', 'myNumber', 'card', 'load');
    useEffect(() => { void load(); }, [load]);
    const [legalOpen, setLegalOpen] = useState(false);

    const name   = card.name || myName || t('settings.myPhone', 'My Phone');
    const number = myNumber ? formatPhone(myNumber) : '—';

    return (
        <SubPage title={t('settings.about', 'About')} onBack={onBack} sub={legalOpen ? <LegalPage onBack={() => setLegalOpen(false)} /> : null}>
            <ListGroup>
                <ListRow label={t('settings.aboutName', 'Name')}         value={name}   divider />
                <ListRow label={t('settings.aboutNetwork', 'Network')}      value="LifeInvader"      divider />
                <ListRow label={t('settings.aboutPhoneNumber', 'Phone Number')} value={number} />
            </ListGroup>

            <ListGroup>
                <ListRow label={t('settings.aboutSoftwareVersion', 'Software Version')} value={OS_VERSION.replace(/^\D+/, '')} divider />
                <ListRow label={t('settings.aboutModelName', 'Model Name')}       value="SD Phone Pro"  divider />
                <ListRow label={t('settings.aboutModelNumber', 'Model Number')}     value="SP-2024"       divider />
                <ListRow label={t('settings.aboutCapacity', 'Capacity')}         value="256 GB"        />
            </ListGroup>

            <ListGroup>
                <ListRow label={t('settings.aboutCarrier', 'Carrier')}          value="LifeInvader Wireless"  divider />
                <ListRow label={t('settings.aboutImei', 'IMEI')}             value="352 099 00 123456 2"   divider />
                <ListRow label={t('settings.aboutSerialNumber', 'Serial Number')}    value="C39ZX8NRPHR4"         />
            </ListGroup>

            <ListGroup>
                <ListRow label={t('settings.aboutLegalRegulatory', 'Legal & Regulatory')} onPress={() => setLegalOpen(true)} />
            </ListGroup>
        </SubPage>
    );
}

function LegalPage({ onBack }: { onBack: () => void }) {
    return (
        <SubPage title={t('settings.aboutLegalRegulatory', 'Legal & Regulatory')} backLabel={t('settings.about', 'About')} onBack={onBack}>
            <div className="mx-4 flex flex-col gap-4 rounded-[10px] bg-white px-4 py-4 text-[13px] leading-relaxed text-ios-gray dark:bg-surface">
                <p>{t('settings.legalIntro', 'This device and its software are provided as part of your service agreement with LifeInvader Wireless.')}</p>
                <p>{t('settings.legalWarranty', 'Hardware is covered by a one-year limited warranty. Unauthorized modification of the operating system voids all warranty coverage.')}</p>
                <p>{t('settings.legalRf', 'This equipment complies with San Andreas RF exposure limits for portable devices. FCC ID: SA-SP2024.')}</p>
                <p>{t('settings.legalTrademarks', 'All product names, logos and brands are property of their respective owners in the state of San Andreas.')}</p>
            </div>
        </SubPage>
    );
}
