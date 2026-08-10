"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Tracks whether the in-flight submit belongs to THIS button.
 *
 * useFormStatus() only says the surrounding form is busy — not which button
 * started it. A form that holds Save next to Delete would otherwise light both
 * up on either click, so each button records its own press.
 *
 * The press is only forgotten once a submit we owned has *finished* — i.e. on a
 * pending true -> false edge. Clearing it on "not pending" alone would wipe the
 * press instantly: the click's state update renders before the submit starts
 * the transition, so there is a beat where the button is pressed but the form
 * is not busy yet, and the label would never change.
 *
 * Returns `busy` (this button's action is running) and `pending` (something in
 * the form is running, mine or not).
 */
export function useOwnPending(): { busy: boolean; pending: boolean; press: () => void } {
  const { pending } = useFormStatus();
  const [mine, setMine] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) setMine(false);
    wasPending.current = pending;
  }, [pending]);

  return { busy: pending && mine, pending, press: () => setMine(true) };
}

type PendingButtonProps = {
  children: React.ReactNode;
  /** Label shown while this button's own action is in flight, e.g. "Saving…". */
  pendingLabel: string;
  style?: React.CSSProperties;
  /** Server action override, for forms whose buttons submit to different actions. */
  formAction?: (formData: FormData) => void | Promise<void>;
  name?: string;
  value?: string;
  title?: string;
  "aria-label"?: string;
};

/**
 * Submit button that reports its own progress: while its action runs the label
 * becomes `pendingLabel` and the button is disabled. Sibling buttons in the
 * same form keep their labels but also disable, so a second action can't be
 * fired into a half-finished one.
 *
 * Must be rendered INSIDE a <form action={...}> to see the submit status.
 */
export function PendingButton({
  children,
  pendingLabel,
  style,
  formAction,
  name,
  value,
  title,
  "aria-label": ariaLabel,
}: PendingButtonProps) {
  const { busy, pending, press } = useOwnPending();

  return (
    <button
      type="submit"
      formAction={formAction}
      name={name}
      value={value}
      title={title}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      onClick={press}
      disabled={pending}
      style={{
        ...style,
        cursor: pending ? "default" : "pointer",
        opacity: pending && !busy ? 0.55 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      {busy ? pendingLabel : children}
    </button>
  );
}
