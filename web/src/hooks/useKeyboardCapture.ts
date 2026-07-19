import { useEffect } from 'react';

import { fetchNui, isFiveM } from '@/core/nui';
import { useDeckActive } from '@/shell/deckActive';

// Claims the physical keyboard for an app that types WITHOUT a text field.
//
// The phone normally hands the keyboard back to the game via
// SetNuiFocusKeepInput(true) (client/main.lua), and only releases it while a real
// <input>/<textarea>/contentEditable is focused - App.tsx watches focusin/focusout
// and pings the 'sd-phone:typing' NUI callback. Apps that read keys straight off
// window (the word games) never trip that listener, so every letter typed also
// reached the game and could fire inventory / weapon wheel / any RegisterKeyMapping
// bind belonging to another resource.
//
// This hook drives the SAME callback imperatively, so no Lua change is needed.
// Capture is gated on useDeckActive() rather than on mount, because AppDeck keeps
// apps alive in the background - a mount-scoped claim would keep swallowing keys
// after the user went back to the home screen or holstered the phone.
//
// Refcounted, since two capturing views can briefly overlap during a transition and
// the last one to unmount must not release a claim the other still holds.
let holders = 0;

function setTyping(typing: boolean): void {
    if (!isFiveM) return;
    void fetchNui('sd-phone:typing', { typing });
}

function acquire(): void {
    holders += 1;
    if (holders === 1) setTyping(true);
}

function release(): void {
    holders = Math.max(0, holders - 1);
    if (holders === 0) setTyping(false);
}

/** True while some app holds the keyboard, so shell-level hotkeys can stand down too. */
export function isKeyboardCaptured(): boolean {
    return holders > 0;
}

/**
 * Keeps game keybinds from firing while a keyboard-driven app is the foreground app.
 * @param enabled pass false to hold the claim off (e.g. the game is over / a sheet is up)
 */
export function useKeyboardCapture(enabled = true): void {
    const deckActive = useDeckActive();
    const on = enabled && deckActive;

    useEffect(() => {
        if (!on) return;
        acquire();
        return release;
    }, [on]);
}
