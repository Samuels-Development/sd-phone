import { t } from '@/i18n';
import { ruleX } from './surfaces';

const PAGER_BUTTON = 'inline-flex shrink-0 items-center px-1 py-[4px] text-[13px] font-semibold text-ios-blue transition-opacity duration-150 hover:opacity-85 active:opacity-60 disabled:cursor-default disabled:opacity-40';

export function Pager({ page, pageSize, total, onPage }: {
    page:     number;
    pageSize: number;
    total:    number;
    onPage:   (page: number) => void;
}) {
    if (total <= pageSize) return null;

    const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, total);
    const lastPage = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="shrink-0">
            <div className={ruleX} />
            <div className="flex items-center gap-2 px-4 py-2">
                <span className="min-w-0 truncate text-[12.5px] font-medium tabular-nums text-ios-gray">
                    {t('common.showingRange', 'Showing {first}-{last} of {total}', { first, last, total })}
                </span>
                <span className="flex-1" />
                <button type="button" className={PAGER_BUTTON} disabled={page <= 1} onClick={() => onPage(page - 1)}>
                    {t('common.previous', 'Previous')}
                </button>
                <button type="button" className={PAGER_BUTTON} disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
                    {t('common.next', 'Next')}
                </button>
            </div>
        </div>
    );
}
