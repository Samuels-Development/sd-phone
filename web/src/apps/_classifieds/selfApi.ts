import { useContactsStore } from '@/stores/contactsStore';
import { listMail, loadActiveAccountId } from '@/apps/mail/data';

export async function loadSelfContact(): Promise<{ number: string; email: string }> {
    await useContactsStore.getState().load();
    const { myNumber, card } = useContactsStore.getState();
    let email = '';

    try {
        const { accounts } = await listMail();
        if (accounts.length > 0) {
            const activeId = loadActiveAccountId();
            const acc = accounts.find(a => a.id === activeId) ?? accounts[0];
            email = acc?.email ?? '';
        }
    } catch {}

    if (!email) email = card?.email ?? '';

    return { number: myNumber ?? '', email };
}
