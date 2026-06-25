'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared hover-card interaction controller (open/close timing + dismissal), hand-rolled because the repo
 * has NO hover-card/tooltip/floating primitive to reuse (verified by a reuse sweep — keyboard nav is
 * already covered by useMeasurementGridKeyboard, motion by the REVEAL_* constants; only this timer/dismiss
 * state machine is genuinely net-new). Kept here as a SHARED hook (not inline in one component) so any
 * future dense-grid cell popover adopts the same model instead of forking it.
 *
 * Model (from the WAI-ARIA tooltip dismissal rules + Radix HoverCard timing, researched):
 *  - OPEN on pointer-enter after `openDelay` (default 120ms — a flowsheet glance, not Radix's 700ms).
 *  - WARM window: if a card closed < `skipWindow` ago (default 300ms), the next open is INSTANT, so gliding
 *    across a row pops each cell with no wait.
 *  - CLOSE after `closeDelay` (default 180ms) on pointer-leave of the anchor, UNLESS the pointer enters the
 *    card (safe area) or another anchor (glide) first — both cancel the pending close.
 *  - Keyboard/explicit open is instant (delay 0) via `openNow`.
 *  - Dismiss on: Escape, scroll (the card is fixed-anchored to a stale rect, so it must close not detach),
 *    and pointer-down OUTSIDE both the anchor and the card. NO blocking scrim (a scrim traps hover).
 *
 * The hook owns ONLY timing + the open payload + global dismissal; the consumer positions/renders the card
 * and wires anchor handlers to {scheduleOpen, scheduleClose, openNow, closeNow} + card handlers to
 * {onCardEnter, onCardLeave}. `cardRef` is the card root (for the outside-pointerdown test).
 */
export type HoverCardController<T> = {
  open: { payload: T; anchor: DOMRect } | null;
  /** Anchor pointer-enter: open after openDelay (or instantly inside the warm window). */
  scheduleOpen: (payload: T, anchor: DOMRect) => void;
  /** Anchor pointer-leave: close after closeDelay unless the card/another anchor is entered first. */
  scheduleClose: () => void;
  /** Explicit/keyboard open — no delay. */
  openNow: (payload: T, anchor: DOMRect) => void;
  /** Immediate close (Escape / scroll / outside). */
  closeNow: () => void;
  /** Card pointer-enter: cancel the pending close (safe area). */
  onCardEnter: () => void;
  /** Card pointer-leave: schedule a close. */
  onCardLeave: () => void;
  cardRef: React.RefObject<HTMLDivElement | null>;
};

let lastClosedAt = 0; // module-scope warm window shared across every hover-card instance.
// The currently-open controller's closeNow, so opening a second hover-card closes the first. Two
// flowsheet instances (Labs + Vitals) each hold their OWN open-state, so without this a direct
// cross-grid glide would briefly show two cards; this enforces "at most one hover-card open" globally.
let activeCloser: (() => void) | null = null;

export function useHoverCard<T>(opts?: {
  openDelay?: number;
  closeDelay?: number;
  skipWindow?: number;
  /** Called when the card closes (e.g. to return focus to the keyboard-selected cell). */
  onClose?: () => void;
}): HoverCardController<T> {
  const openDelay = opts?.openDelay ?? 120;
  const closeDelay = opts?.closeDelay ?? 180;
  const skipWindow = opts?.skipWindow ?? 300;
  const onCloseCb = opts?.onClose;

  const [open, setOpen] = useState<{ payload: T; anchor: DOMRect } | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRectRef = useRef<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  // This instance's own open/closed flag, so the module-scope state (warm window, active closer) mutates
  // ONCE per real transition — not on a glide re-open, and never double on a StrictMode-replayed setState
  // updater (this lives here in imperative code, not inside a setOpen updater).
  const isOpenRef = useRef(false);

  const closeNow = useCallback(() => {
    clearTimers();
    if (isOpenRef.current) {
      isOpenRef.current = false;
      lastClosedAt = Date.now();
      if (activeCloser === closeNowRef.current) activeCloser = null;
    }
    setOpen(null);
    anchorRectRef.current = null;
    onCloseCb?.();
  }, [onCloseCb]);

  // Self-reference so closeNow/doOpen can compare against THIS instance's closer at module scope.
  const closeNowRef = useRef(closeNow);
  useEffect(() => { closeNowRef.current = closeNow; }, [closeNow]);

  const doOpen = useCallback((payload: T, anchor: DOMRect) => {
    // At most one hover-card open globally: close any other instance first (cross-grid glide).
    if (activeCloser && activeCloser !== closeNowRef.current) activeCloser();
    if (!isOpenRef.current) isOpenRef.current = true; // glide within a grid doesn't re-toggle.
    activeCloser = closeNowRef.current;
    anchorRectRef.current = anchor;
    setOpen({ payload, anchor });
  }, []);

  const scheduleOpen = useCallback((payload: T, anchor: DOMRect) => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (openTimer.current) clearTimeout(openTimer.current);
    const warm = Date.now() - lastClosedAt < skipWindow;
    openTimer.current = setTimeout(() => doOpen(payload, anchor), warm ? 0 : openDelay);
  }, [doOpen, openDelay, skipWindow]);

  const openNow = useCallback((payload: T, anchor: DOMRect) => {
    clearTimers();
    doOpen(payload, anchor);
  }, [doOpen]);

  const scheduleClose = useCallback(() => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => closeNow(), closeDelay);
  }, [closeNow, closeDelay]);

  const onCardEnter = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);
  const onCardLeave = useCallback(() => scheduleClose(), [scheduleClose]);

  // Global dismissal while open: Escape, scroll (fixed-anchored card must close, not detach), and a
  // pointer-down OUTSIDE both the anchor and the card. No scrim — these listeners replace it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeNow(); } };
    const onScroll = () => closeNow();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const inCard = cardRef.current?.contains(t);
      // Anchor membership: the consumer marks anchors with data-hovercard-anchor; closest() covers it.
      const inAnchor = t instanceof Element && t.closest('[data-hovercard-anchor]');
      if (!inCard && !inAnchor) closeNow();
    };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, closeNow]);

  // Unmount cleanup: clear timers AND release the module-scope active-closer if this instance unmounts
  // while open (otherwise activeCloser dangles at a dead instance). closeNow is idempotent via isOpenRef;
  // the trailing setOpen(null) on an unmounting component is a harmless no-op.
  useEffect(() => () => { closeNowRef.current(); }, []);

  return { open, scheduleOpen, scheduleClose, openNow, closeNow, onCardEnter, onCardLeave, cardRef };
}
