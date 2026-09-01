import { useState } from 'react';

import { apiData } from '@/core/api';
import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { useDidEnter } from '@/hooks/useDidEnter';
import { AlertDialog } from '@/ui/AlertDialog';
import { LISTINGS, type Listing, type ListingDraft } from './data';
import { MarketplaceListTab } from './MarketplaceListTab';
import { YourPostsTab } from './YourPostsTab';
import { CreateEntryPage } from '@/apps/_classifieds/CreateEntryPage';
import { ListingDetail } from '@/apps/_classifieds/ListingDetail';
import { useClassifiedsFeed } from '@/apps/_classifieds/useClassifiedsFeed';
import { useContactActions } from '@/apps/_classifieds/useContactActions';
import { MarketplaceTabBar, type MarketTab } from './MarketplaceTabBar';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function Marketplace({ onClose: _onClose }: { onClose: () => void }) {
    const [tab,      setTab]      = useSessionState<MarketTab>('marketplace:tab', 'home');
    const [creating, setCreating] = useSessionState('marketplace:creating', false);
    const [editing,  setEditing]  = useSessionState<Listing | null>('marketplace:editing', null);
    const [confirmDelete, setConfirmDelete] = useState<Listing | null>(null);
    const [openId,   setOpenId]   = useSessionState<string | null>('marketplace:openListing', null);
    const [listings, setListings] = useClassifiedsFeed<Listing>(
        'sd-phone:marketplace:list', 'sd-phone:marketplace:feed', 'sd-phone:marketplace:watch', 'listings', isFiveM ? [] : LISTINGS,
        rid => { setOpenId(cur => (cur === rid ? null : cur)); setEditing(cur => (cur?.id === rid ? null : cur)); },
    );
    const open = listings.find(l => l.id === openId) ?? null;
    const contact = useContactActions();

    const animateNav = useDidEnter();

    function addListing(draft: ListingDraft) {
        setCreating(false);
        setTab('posts');
        if (!isFiveM) {
            const listing: Listing = {
                id:     'new-' + Date.now(),
                title:  draft.title,
                body:   draft.body,
                price:  draft.price,
                image:  draft.image,
                images: draft.images,
                number: draft.number || '0000000000',
                email:  draft.email,
                date:   'Just now',
                mine:   true,
            };
            setListings(prev => [listing, ...prev]);
            return;
        }
        apiData<{ listing: Listing }>('sd-phone:marketplace:create', draft)
            .then(data => { if (data) setListings(prev => [data.listing, ...prev]); })
            .catch(() => {});
    }

    function updateListing(id: string, draft: ListingDraft) {
        setEditing(null);
        setListings(prev => prev.map(l => l.id === id ? {
            ...l,
            title:  draft.title,
            body:   draft.body,
            price:  draft.price,
            image:  draft.image,
            images: draft.images,
            number: draft.number || l.number,
            email:  draft.email,
        } : l));
        if (!isFiveM) return;
        apiData<{ listing: Listing }>('sd-phone:marketplace:update', { id, ...draft })
            .then(data => { if (data) setListings(prev => prev.map(l => l.id === id ? data.listing : l)); })
            .catch(() => {});
    }

    function deleteListing(id: string) {
        setListings(prev => prev.filter(l => l.id !== id));
        if (isFiveM) void fetchNui('sd-phone:marketplace:delete', { id });
    }

    function callPoster(l: Listing) {
        contact.call(l.number, l.mine);
    }
    function messagePoster(l: Listing) {
        contact.message(l.number, l.mine);
    }
    function emailPoster(l: Listing) {
        contact.email(l.email ?? '', l.mine);
    }

    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <StatusBarSpacer />

            <div className="flex flex-1 flex-col overflow-hidden">
                <div key={tab} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                    {tab === 'home'
                        ? <MarketplaceListTab listings={listings} onCreate={() => setCreating(true)} onOpen={l => setOpenId(l.id)} onMessage={messagePoster} onCall={callPoster} onEmail={emailPoster} onDelete={setConfirmDelete} />
                        : <YourPostsTab listings={listings} onCreate={() => setCreating(true)} onOpen={l => setOpenId(l.id)} onDelete={setConfirmDelete} />}
                </div>
            </div>

            <MarketplaceTabBar tab={tab} onChange={setTab} />

            {creating && (
                <CreateEntryPage pageTitle={t('marketplace.newListing','New Listing')} backLabel={t('marketplace.marketplace','Marketplace')} bodyPlaceholder={t('marketplace.sellingPlaceholder','What are you selling?')}
                    draftKey="marketplace:createDraft" animateIn={animateNav}
                    onCancel={() => setCreating(false)} onCreate={addListing} />
            )}

            {open && (
                <ListingDetail
                    item={open}
                    backLabel={tab === 'home' ? t('marketplace.home','Home') : t('marketplace.yourPosts','Your Posts')}
                    itemNoun={t('marketplace.listing','Listing')}
                    onBack={() => setOpenId(null)}
                    onMessage={() => messagePoster(open)}
                    onCall={() => callPoster(open)}
                    onEmail={() => emailPoster(open)}
                    onEdit={() => setEditing(open)}
                    onDelete={() => { deleteListing(open.id); setOpenId(null); }}
                    animateIn={animateNav}
                />
            )}

            {editing && (
                <CreateEntryPage pageTitle={t('marketplace.editListing','Edit Listing')} submitLabel={t('marketplace.save','Save')} backLabel={t('marketplace.listing','Listing')}
                    bodyPlaceholder={t('marketplace.sellingPlaceholder','What are you selling?')} initial={editing}
                    draftKey="marketplace:editDraft" animateIn={animateNav}
                    onCancel={() => setEditing(null)} onCreate={draft => updateListing(editing.id, draft)} />
            )}

            {contact.dialog}

            {confirmDelete && (
                <AlertDialog
                    title={t('marketplace.removeListingTitle','Remove Listing?')}
                    message={t('marketplace.removeListingMessage','This will permanently remove your listing.')}
                    confirmLabel={t('marketplace.remove','Remove')}
                    destructive
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={() => { deleteListing(confirmDelete.id); setConfirmDelete(null); }}
                />
            )}
        </div>
    );
}
