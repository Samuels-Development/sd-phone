import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { copyToClipboard } from '@/lib/clipboard';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { fieldLabel, fieldValue, type IdCardData } from './data';

export function DetailsList({ card }: { card: IdCardData }) {
    const [copied, setCopied] = useState<string | null>(null);
    const timer = useRef<number | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(timer.current), []);

    function copy(key: string, value: string) {
        if (!copyToClipboard(value)) return;
        setCopied(key);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(null), 1400);
    }

    const rows = [{ key: 'name', label: t('id.fieldName', 'Name'), value: card.name }]
        .concat(card.fields.map(f => ({ key: f.key, label: fieldLabel(f.key), value: fieldValue(f.key, f.value) })));

    return (
        <div>
            <ListGroup header={t('id.details', 'Details')} footer={t('id.tapToCopy', 'Tap a row to copy it.')}>
                {rows.map((r, i) => (
                    <ListRow
                        key={r.key}
                        label={r.label}
                        value={copied === r.key ? t('id.copied', 'Copied') : r.value}
                        divider={i < rows.length - 1}
                        onPress={() => copy(r.key, r.value)}
                    />
                ))}
            </ListGroup>
            <div className="mt-2 px-4 text-[13px] text-ios-gray">{t('id.issuedBy', 'Issued by {issuer}', { issuer: card.issuer })}</div>
        </div>
    );
}
