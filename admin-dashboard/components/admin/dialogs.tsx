"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons";
import { cx } from "./ui";

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {title}
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-canvas">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export type ConfirmRequest = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Ask for a free-text note/reason. */
  input?: { label: string; required?: boolean; placeholder?: string };
  onConfirm: (note: string) => void | Promise<void>;
};

/** Hook + element pair: `const { ask, dialog } = useConfirm();` then render `{dialog}`. */
export function useConfirm() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setReq(null);
    setNote("");
  };

  const dialog = (
    <Modal
      open={req !== null}
      title={req?.title ?? ""}
      onClose={close}
      footer={
        <>
          <button type="button" onClick={close} className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || (req?.input?.required && !note.trim())}
            onClick={async () => {
              if (!req) return;
              setBusy(true);
              try {
                await req.onConfirm(note.trim());
              } finally {
                setBusy(false);
                setReq(null);
                setNote("");
              }
            }}
            className={cx(
              "rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50",
              req?.danger ? "bg-brand hover:bg-brand-dark" : "bg-ink hover:bg-black",
            )}
          >
            {busy ? "Working…" : req?.confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm leading-6 text-ink/80">{req?.message}</div>
      {req?.input ? (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {req.input.label}
            {req.input.required ? <span className="text-brand"> *</span> : null}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={req.input.placeholder}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
          />
        </label>
      ) : null}
    </Modal>
  );

  return { ask: (r: ConfirmRequest) => setReq(r), dialog };
}

/** Short-lived success / error toast. */
export function useToast() {
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const element = toast ? (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cx(
        "fixed bottom-5 left-1/2 z-[60] flex max-w-[92vw] -translate-x-1/2 items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl",
        toast.tone === "error" ? "bg-brand" : "bg-ink",
      )}
    >
      <Icon name={toast.tone === "error" ? "info" : "checkCircle"} size={18} />
      {toast.text}
    </div>
  ) : null;

  return {
    success: (text: string) => setToast({ tone: "success", text }),
    error: (text: string) => setToast({ tone: "error", text }),
    element,
  };
}
