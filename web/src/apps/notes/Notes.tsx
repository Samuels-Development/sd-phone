import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchNui, isFiveM } from '@/core/nui';
import { failText } from '@/core/api';
import { useDidEnter } from '@/hooks/useDidEnter';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useNuiQuery } from '@/hooks/useNuiQuery';
import { useSessionState } from '@/hooks/useSessionState';
import { AlertDialog } from '@/ui/AlertDialog';
import { Spinner } from '@/ui/Spinner';
import {
    fetchNote, fullNote, loadState, newId, noteHasContent, savePayload, saveNoteRemote, sameSketches,
    saveState, summariesToState,
} from './data';
import type { Note, NoteSummary, NotesState } from './data';
import { NoteEditor } from './NoteEditor';
import { NotesList } from './NotesList';
import { t } from '@/i18n';
import { useDeeplinkTarget } from '@/shell/deeplink';

export function Notes({ onClose }: { onClose: () => void }) {
    const [state, setState] = useState<NotesState>(() => (isFiveM ? { notes: [] } : loadState()));
    const [openId, setOpenId] = useSessionState<string | null>('notes:openNoteId', null);
    const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const savedSketches = useRef(new Map<string, string[]>());
    const refusedSketches = useRef(new Map<string, string[]>());
    useDeeplinkTarget('notes', target => setPendingNoteId(target.noteId));
    useEffect(() => {
        if (!pendingNoteId || !state.notes.some(n => n.id === pendingNoteId)) return;
        setOpenId(pendingNoteId);
        setPendingNoteId(null);
    }, [pendingNoteId, state.notes, setOpenId]);

    useNuiQuery<{ notes?: NoteSummary[] }>('sd-phone:notes:list', {
        enabled: isFiveM,
        onData: data => setState(summariesToState(data)),
    });

    const remember = useCallback((note: Note) => {
        savedSketches.current.set(note.id, note.sketches);
        refusedSketches.current.delete(note.id);
    }, []);

    useNuiEvent('sd-phone:notes:added', useCallback((raw: Note) => {
        const note = fullNote(raw);
        remember(note);
        setState(prev => prev.notes.some(n => n.id === note.id)
            ? prev
            : { notes: [note, ...prev.notes] });
    }, [remember]));

    const commit = useCallback((next: NotesState) => {
        setState(next);
        if (!isFiveM) saveState(next);
    }, []);

    const saveNote = useCallback((n: Note) => {
        if (!isFiveM) return;
        const refused = refusedSketches.current.get(n.id);
        const known = refused && sameSketches(n.sketches, refused) ? refused : savedSketches.current.get(n.id);
        const payload = savePayload(n, known);
        const previous = savedSketches.current.get(n.id);
        if (payload.sketches) savedSketches.current.set(n.id, payload.sketches);
        void saveNoteRemote(payload).then(res => {
            if (res.success || !payload.sketches) return;
            if (savedSketches.current.get(n.id) === payload.sketches) {
                if (previous) savedSketches.current.set(n.id, previous);
                else savedSketches.current.delete(n.id);
            }
            if (res.data?.textSaved) {
                refusedSketches.current.set(n.id, payload.sketches);
                setSaveError(failText(res, t('notes.drawingNotSaved', 'The drawing could not be saved.')));
            }
        });
    }, []);
    const removeNote = useCallback((id: string) => {
        savedSketches.current.delete(id);
        refusedSketches.current.delete(id);
        if (isFiveM) void fetchNui('sd-phone:notes:delete', { id });
    }, []);

    const open = openId ? state.notes.find(n => n.id === openId) : null;
    const loadingId = open?.partial ? open.id : null;

    useEffect(() => {
        if (!loadingId) return;
        let live = true;
        void fetchNote(loadingId).then(note => {
            if (!live) return;
            if (!note) {
                setOpenId(null);
                return;
            }
            remember(note);
            setState(prev => ({ notes: prev.notes.map(n => n.id === note.id ? note : n) }));
        });
        return () => { live = false; };
    }, [loadingId, remember, setOpenId]);

    function createNote() {
        const now = new Date().toISOString();
        const n: Note = {
            id:        newId(),
            body:      '',
            sketches:  [],
            images:    [],
            createdAt: now,
            updatedAt: now,
        };
        commit({ notes: [n, ...state.notes] });
        remember(n);
        saveNote(n);
        setOpenId(n.id);
    }

    function deleteNote(id: string) {
        commit({ notes: state.notes.filter(n => n.id !== id) });
        removeNote(id);
        if (openId === id) setOpenId(null);
    }

    function updateNote(next: Note) {
        commit({ notes: state.notes.map(n => n.id === next.id ? next : n) });
        saveNote(next);
    }

    function closeEditor() {
        if (openId) {
            const n = state.notes.find(x => x.id === openId);
            if (n && !n.partial && !noteHasContent(n)) {
                deleteNote(openId);
                return;
            }
        }
        setOpenId(null);
    }

    const animateNav = useDidEnter();

    return (
        <div className="absolute inset-0 z-10 overflow-hidden bg-[#fbf9f3] dark:bg-base">
            <NotesList
                notes={state.notes}
                onOpen={setOpenId}
                onCompose={createNote}
            />
            {open && !open.partial && (
                <NoteEditor
                    note={open}
                    onBack={closeEditor}
                    onChange={updateNote}
                    onDelete={() => deleteNote(open.id)}
                    animateIn={animateNav}
                />
            )}
            {loadingId && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-base/60">
                    <Spinner />
                </div>
            )}
            {saveError && (
                <AlertDialog
                    title={t('notes.drawingNotSavedTitle', 'Drawing Not Saved')}
                    message={saveError}
                    hideCancel
                    onCancel={() => setSaveError(null)}
                    onConfirm={() => setSaveError(null)}
                />
            )}
            <button
                type="button"
                onClick={onClose}
                aria-label={t('notes.closeNotes', 'Close Notes')}
                className="absolute inset-x-0 bottom-0 z-50 h-7 cursor-default"
            />
        </div>
    );
}
