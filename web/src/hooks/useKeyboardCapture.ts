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
// Two claim tiers. A FULL claim (letter-typing apps - the word games) releases keep-input
// entirely: every key must reach only the phone, and movement freezes. A NUMERIC claim
// (digit pads - lockscreen PIN, dialer) keeps keep-input on so the player can still move;
// the client suppresses the GTA digit weapon binds per frame instead. A full claim anywhere
// outranks any number of numeric ones.
let fullHolders = 0;
let numericHolders = 0;

function sync(): void {
    if (!isFiveM) return;
    const typing  = fullHolders > 0 || numericHolders > 0;
    const numeric = fullHolders === 0 && numericHolders > 0;
    void fetchNui('sd-phone:typing', { typing, numeric });
}

function acquire(numeric: boolean): void {
    if (numeric) numericHolders += 1;
    else fullHolders += 1;
    sync();
}

function release(numeric: boolean): void {
    if (numeric) numericHolders = Math.max(0, numericHolders - 1);
    else fullHolders = Math.max(0, fullHolders - 1);
    sync();
}

/** True while some app holds the keyboard, so shell-level hotkeys can stand down too. */
export function isKeyboardCaptured(): boolean {
    return fullHolders + numericHolders > 0;
}

/**
 * Keeps game keybinds from firing while a keyboard-driven app is the foreground app.
 * @param enabled pass false to hold the claim off (e.g. the game is over / a sheet is up)
 * @param numeric digit-pad tier: the player keeps moving while the pad is active
 */
export function useKeyboardCapture(enabled = true, numeric = false): void {
    const deckActive = useDeckActive();
    const on = enabled && deckActive;

    useEffect(() => {
        if (!on) return;
        acquire(numeric);
        return () => release(numeric);
    }, [on, numeric]);
}
