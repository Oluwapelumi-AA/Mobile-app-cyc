"use client";

import { type ReactNode, useState } from "react";
import { useChapters } from "./data";
import { cx } from "./ui";

const INPUT =
  "w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft disabled:bg-canvas";

function Label({ label, required, hint, children, className }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-brand"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
  type = "text",
  className,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  type?: "text" | "url" | "number" | "datetime-local" | "email";
  className?: string;
  min?: number;
  max?: number;
}) {
  return (
    <Label label={label} required={required} hint={hint} className={className}>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(INPUT, "h-10")}
      />
    </Label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
  rows = 4,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <Label label={label} required={required} hint={hint} className={className}>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(INPUT, "py-2.5 leading-6")}
      />
    </Label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  required,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <Label label={label} required={required} hint={hint} className={className}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(INPUT, "h-10")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Label>
  );
}

export function CheckRow({
  label,
  checked,
  onChange,
  hint,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-2.5", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-brand"
      />
      <span className="text-sm text-ink">
        {label}
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Chapter picker. "" means app-wide. */
export function ChapterSelect({
  value,
  onChange,
  allowAppWide = true,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  allowAppWide?: boolean;
  className?: string;
}) {
  const { chapters } = useChapters();
  const active = chapters.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Select
      label="Chapter"
      value={value}
      onChange={onChange}
      className={className}
      hint={allowAppWide ? "App-wide items are visible to everyone in the app." : undefined}
      options={[
        ...(allowAppWide ? [{ value: "", label: "App-wide (all chapters)" }] : []),
        ...active.map((c) => ({ value: c.id, label: c.name })),
      ]}
    />
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-4 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand">
      {message}
    </p>
  );
}

/** Track a submit: busy flag plus the error to show. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/** "2026-11-20T18:00" for a datetime-local input, in the browser's time. */
export function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Turn "" into null and trim everything else. */
export function orNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export const COMMON_TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Dubai",
  "UTC",
];

export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos";
  } catch {
    return "Africa/Lagos";
  }
}
