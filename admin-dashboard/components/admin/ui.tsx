"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "./icons";

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function compactNumber(value: number) {
  if (value < 1000) return String(value);
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function timeAgo(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return "—";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatDate(value)}, ${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** Two-line date / time cell used in Notifications and Audit log tables. */
export function DateTimeCell({ value }: { value: string }) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return <span>—</span>;
  return (
    <span className="whitespace-nowrap">
      {formatDate(value)}
      <br />
      <span className="text-ink/70">{d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
    </span>
  );
}

export function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Layout pieces                                                       */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-[28px]">
          {title}
        </h1>
        <p className="mt-1.5 text-[13px] text-ink/80 sm:text-base">{subtitle}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "min-w-0 rounded-2xl border border-line/70 bg-white shadow-[0_1px_2px_rgba(30,20,10,0.03)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-x-3 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight text-ink sm:text-xl">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ViewAll({ onClick, label = "View all" }: { onClick?: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-dark"
    >
      {label}
      <Icon name="arrowRight" size={16} />
    </button>
  );
}

export function PrimaryButton({
  children,
  icon = "plus",
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  icon?: IconName | null;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {icon ? <Icon name={icon} size={18} strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  icon,
  onClick,
  disabled,
  tone = "default",
  className,
}: {
  children: ReactNode;
  icon?: IconName;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "brand" | "danger" | "warning" | "success";
  className?: string;
}) {
  const tones = {
    default: "border-line bg-white text-ink hover:bg-canvas",
    brand: "border-brand/40 bg-white text-brand hover:bg-brand-soft",
    danger: "border-transparent bg-brand-soft text-brand hover:bg-brand-tint",
    warning: "border-transparent bg-amber-50 text-amber-800 hover:bg-amber-100",
    success: "border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        tones[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export type Tone =
  | "red"
  | "green"
  | "amber"
  | "gray"
  | "purple"
  | "blue"
  | "teal"
  | "pink";

const toneClasses: Record<Tone, string> = {
  red: "bg-brand-soft text-brand",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  gray: "bg-stone-100 text-stone-600",
  purple: "bg-violet-50 text-violet-700",
  blue: "bg-sky-50 text-sky-700",
  teal: "bg-teal-50 text-teal-700",
  pink: "bg-pink-50 text-pink-700",
};

export function Badge({
  tone = "gray",
  children,
  dot,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium leading-none",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Status words → badge tone, shared across screens. */
export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (["active", "published", "resolved", "success", "sent", "completed", "connected", "live", "approved", "yes", "ready"].includes(s))
    return "green";
  if (["under review", "pending", "scheduled", "draft", "processing"].includes(s)) return "amber";
  if (["new", "flagged", "banned", "muted", "inactive", "failed", "cancelled", "not connected", "no", "live now", "deleted", "suspended"].includes(s))
    return "red";
  return "gray";
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}

export function Delta({
  value,
  goodWhenUp = true,
  className,
}: {
  value: number;
  goodWhenUp?: boolean;
  className?: string;
}) {
  const up = value >= 0;
  const good = up === goodWhenUp;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold",
        good ? "bg-emerald-50 text-emerald-700" : "bg-brand-soft text-brand",
        className,
      )}
    >
      <Icon name={up ? "arrowUp" : "arrowDown"} size={12} strokeWidth={2.4} />
      {Math.abs(value)}%
    </span>
  );
}

export function SampleTag({ reason }: { reason?: string }) {
  return (
    <span
      title={reason || "The live API returned no data, so sample records are shown."}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-amber-800"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Sample data
    </span>
  );
}

export function LiveTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-800">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Live
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Icon tile + stat cards                                              */
/* ------------------------------------------------------------------ */

const iconTileTones = {
  red: "bg-brand-soft text-brand",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
} as const;

export function IconTile({
  icon,
  tone = "red",
  size = "md",
}: {
  icon: IconName;
  tone?: keyof typeof iconTileTones;
  size?: "sm" | "md" | "lg";
}) {
  const dims = { sm: "h-10 w-10", md: "h-12 w-12", lg: "h-14 w-14" }[size];
  const icon_size = { sm: 20, md: 22, lg: 26 }[size];
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full",
        dims,
        iconTileTones[tone],
      )}
    >
      <Icon name={icon} size={icon_size} />
    </span>
  );
}

/** Wide KPI card used across the top of Overview and Events. */
export function KpiCard({
  icon,
  label,
  value,
  delta,
  goodWhenUp,
  note,
  trend,
}: {
  icon: IconName;
  label: string;
  value: string;
  delta?: number;
  goodWhenUp?: boolean;
  note?: string;
  trend?: number[];
}) {
  return (
    <Card className="flex items-center gap-3.5 p-4 sm:p-5">
      <IconTile icon={icon} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-ink/80">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[23px] font-bold leading-none tracking-tight text-ink">
            {value}
          </span>
          {delta !== undefined ? <Delta value={delta} goodWhenUp={goodWhenUp} /> : null}
        </div>
        {note ? <p className="mt-2 text-[11.5px] leading-snug text-muted">{note}</p> : null}
      </div>
      {trend ? <Sparkline data={trend} className="hidden h-9 w-16 shrink-0 self-end sm:block" /> : null}
    </Card>
  );
}

/** Compact tile for the right-hand "overview" panels. */
export function MiniStat({
  icon,
  value,
  label,
  delta,
  goodWhenUp,
  tone = "red",
}: {
  icon: IconName;
  value: string;
  label: string;
  delta?: number;
  goodWhenUp?: boolean;
  tone?: keyof typeof iconTileTones;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line/80 p-3">
      <IconTile icon={icon} tone={tone} size="sm" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xl font-bold leading-tight text-ink">{value}</span>
          {delta !== undefined ? <Delta value={delta} goodWhenUp={goodWhenUp} /> : null}
        </div>
        <p className="truncate text-[11px] text-muted">{label}</p>
      </div>
    </div>
  );
}

/** KPI card: label + icon on top, big number, delta/note and a sparkline. */
export function StatCard({
  icon,
  label,
  value,
  delta,
  goodWhenUp,
  note,
  trend,
}: {
  icon: IconName;
  label: string;
  value: string;
  delta?: number;
  goodWhenUp?: boolean;
  note: string;
  trend?: number[];
}) {
  return (
    <Card className="flex flex-col gap-4 p-5 transition hover:shadow-[0_8px_24px_-12px_rgba(134,0,0,0.25)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[28px] font-bold leading-none tracking-tight text-ink tabular-nums">{value}</p>
          <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            {delta !== undefined ? <Delta value={delta} goodWhenUp={goodWhenUp} /> : null}
            <span className="truncate">{note}</span>
          </p>
        </div>
        {trend ? <Sparkline data={trend} className="h-10 w-20 shrink-0" /> : null}
      </div>
    </Card>
  );
}

/** Ring gauge with a percentage in the middle. */
export function Ring({ value, label }: { value: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative mx-auto h-[150px] w-[150px]">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#f6e6e6" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#860000"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[30px] font-bold leading-none tracking-tight text-ink tabular-nums">{pct}%</span>
        <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
      </div>
    </div>
  );
}

/** Labelled percentage bar. */
export function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-muted">{label}</span>
        <span className="text-[15px] font-semibold text-ink tabular-nums">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  size = "md",
}: {
  tabs: { key: K; label: string; count?: number | string }[];
  value: K;
  onChange: (key: K) => void;
  size?: "md" | "sm";
}) {
  return (
    <div className="scroll-thin -mb-px flex gap-1 overflow-x-auto" role="tablist">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cx(
              "relative shrink-0 whitespace-nowrap pb-3.5 pt-1 transition",
              size === "sm" ? "px-1.5 text-[12px]" : "px-3 text-[13px]",
              active ? "font-semibold text-brand" : "text-ink/70 hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? ` (${tab.count})` : ""}
            {active ? (
              <span className="absolute inset-x-1 bottom-0 h-[3px] rounded-full bg-brand" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cx("relative block min-w-0", className)}>
      <span className="sr-only">{placeholder}</span>
      <Icon
        name="search"
        size={18}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-[12px] text-ink outline-none placeholder:text-faint focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
      />
    </label>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <label className={cx("relative block min-w-0", className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full cursor-pointer appearance-none truncate rounded-xl border border-line bg-white pl-3 pr-8 text-[12px] text-ink outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevronDown"
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/70"
      />
    </label>
  );
}

export const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

export function RangeSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <SelectField
      label="Date range"
      value={value}
      onChange={onChange}
      options={RANGE_OPTIONS}
      className={cx("w-[140px]", className)}
    />
  );
}

export function DateRangeChip({ days = 30 }: { days?: number }) {
  const label = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    const sameYear = start.getFullYear() === end.getFullYear();
    const fmt = (d: Date, year: boolean) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
    return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
  }, [days]);
  return (
    <span className="col-span-2 inline-flex h-10 min-w-0 items-center gap-2 rounded-xl border border-line bg-white px-3 text-[12px] text-ink md:col-auto">
      <Icon name="calendar" size={16} className="shrink-0" />
      <span className="truncate whitespace-nowrap">{label}</span>
    </span>
  );
}

export function ExportButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-[12px] font-medium text-ink hover:bg-canvas"
    >
      <Icon name="download" size={17} />
      Export
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Table helpers                                                       */
/* ------------------------------------------------------------------ */

export function Table({
  children,
  minWidth = 860,
}: {
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="data-table w-full text-left" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  sortable,
}: {
  children?: ReactNode;
  className?: string;
  sortable?: boolean;
}) {
  return (
    <th
      className={cx(
        "whitespace-nowrap bg-canvas/70 px-2.5 py-3 text-[11.5px] font-medium text-ink/70 first:rounded-l-xl last:rounded-r-xl",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortable ? <Icon name="chevronDown" size={13} className="text-ink/50" /> : null}
      </span>
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cx("border-b border-line/70 px-2.5 py-3 align-middle text-[12px] text-ink/85", className)}>
      {children}
    </td>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer rounded border-line accent-brand"
    />
  );
}

/** Selection state for tables with a "select all" header checkbox. */
export function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  return {
    selected,
    all,
    toggle(id: string, on: boolean) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    toggleAll(on: boolean) {
      setSelected(on ? new Set(ids) : new Set());
    },
    clear() {
      setSelected(new Set());
    },
  };
}

export function Pagination({
  page,
  pages,
  onPage,
  summary,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  summary: string;
}) {
  const visible = useMemo(() => {
    if (pages <= 6) return Array.from({ length: pages }, (_, i) => i + 1);
    const set = new Set([1, 2, 3, 4, 5, page, pages].filter((n) => n >= 1 && n <= pages));
    return [...set].sort((a, b) => a - b);
  }, [page, pages]);

  const btn =
    "flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-[13px] transition";

  return (
    <div className="flex flex-col gap-3 px-1 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={cx(btn, "border border-line bg-white text-ink hover:bg-canvas disabled:opacity-40")}
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        {visible.map((n, i) => (
          <span key={n} className="flex items-center gap-1.5">
            {i > 0 && n - visible[i - 1] > 1 ? <span className="px-1 text-muted">…</span> : null}
            <button
              type="button"
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
              className={cx(
                btn,
                n === page ? "bg-brand-soft font-semibold text-brand" : "text-ink/75 hover:bg-canvas",
              )}
            >
              {n}
            </button>
          </span>
        ))}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className={cx(btn, "border border-line bg-white text-ink hover:bg-canvas disabled:opacity-40")}
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
      <p className="text-[13px] text-ink/70">{summary}</p>
    </div>
  );
}

/** Client-side paging helper. */
export function usePaged<T>(items: T[], perPage = 10) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, pages);
  const slice = items.slice((current - 1) * perPage, current * perPage);
  const from = items.length ? (current - 1) * perPage + 1 : 0;
  const to = Math.min(current * perPage, items.length);
  return { page: current, pages, setPage, slice, from, to };
}

/** Kebab (⋮) menu for table rows. */
export function RowMenu({
  actions,
  label = "Actions",
  horizontal,
}: {
  actions: { label: string; icon?: IconName; danger?: boolean; onSelect: () => void }[];
  label?: string;
  horizontal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-canvas"
      >
        <Icon name={horizontal ? "moreH" : "more"} size={18} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
              className={cx(
                "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-canvas",
                a.danger ? "text-brand" : "text-ink",
              )}
            >
              {a.icon ? <Icon name={a.icon} size={16} /> : null}
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyRow({ cols, title, hint }: { cols: number; title: string; hint?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-6 py-14 text-center">
        <p className="font-semibold text-ink">{title}</p>
        {hint ? <p className="mt-1.5 text-sm text-muted">{hint}</p> : null}
      </td>
    </tr>
  );
}

export function LoadingRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="border-b border-line/70 px-3 py-4">
              <div className="h-3.5 animate-pulse rounded bg-canvas" style={{ width: `${40 + ((r * 7 + c * 13) % 50)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Avatars + media thumbnails                                          */
/* ------------------------------------------------------------------ */

const avatarPalette = [
  ["#3b2a20", "#f3d9c6"],
  ["#5b2c1d", "#f6dcc9"],
  ["#2d2a26", "#e9e1d8"],
  ["#6b3b2a", "#fbe6d6"],
  ["#40302a", "#efd5c3"],
  ["#1f2937", "#e5e7eb"],
];

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  return (
    name
      .trim()
      .split(/[\s@._-]+/)
      .filter((p) => /^[\p{L}]/u.test(p))
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"
  );
}

export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [bg, fg] = avatarPalette[hash(name) % avatarPalette.length];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cx("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx("flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}

const thumbScenes = [
  { bg: "linear-gradient(160deg,#2a1208 0%,#7a2e10 45%,#e8892f 80%,#f6c063 100%)", icon: "cross" as IconName },
  { bg: "linear-gradient(160deg,#3a2414 0%,#8a5a32 50%,#d9b07a 100%)", icon: "book" as IconName },
  { bg: "linear-gradient(170deg,#1c0f0a 0%,#5c2412 45%,#c9541d 85%,#f0a24a 100%)", icon: "users" as IconName },
  { bg: "linear-gradient(165deg,#24140c 0%,#6d3416 50%,#d17a33 100%)", icon: "heart" as IconName },
  { bg: "linear-gradient(160deg,#101826 0%,#2b3f5c 50%,#a7764a 100%)", icon: "cross" as IconName },
  { bg: "linear-gradient(160deg,#2b1a10 0%,#6e4426 55%,#c79a63 100%)", icon: "book" as IconName },
];

/** Warm photographic-style placeholder used where content has no cover image. */
export function Thumb({
  seed,
  icon,
  width = 56,
  height = 48,
  duration,
  rounded = "rounded-lg",
  className,
}: {
  seed: string;
  icon?: IconName;
  width?: number | string;
  height?: number | string;
  duration?: string;
  rounded?: string;
  className?: string;
}) {
  const scene = thumbScenes[hash(seed) % thumbScenes.length];
  return (
    <span
      aria-hidden="true"
      className={cx("relative flex shrink-0 items-center justify-center overflow-hidden", rounded, className)}
      style={{ width, height, background: scene.bg }}
    >
      <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
      <Icon name={icon ?? scene.icon} size={typeof height === "number" ? Math.max(16, height * 0.42) : 28} strokeWidth={2} className="relative text-white/90 drop-shadow" />
      {duration ? (
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-px text-[9px] font-medium text-white">
          {duration}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const id = useId().replace(/:/g, "");
  const w = 80;
  const h = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 4 - ((v - min) / (max - min || 1)) * (h - 8),
  ]);
  const line = smoothPath(pts);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`sp${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#c62828" stopOpacity="0.25" />
          <stop offset="1" stopColor="#c62828" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#sp${id})`} />
      <path d={line} fill="none" stroke="#c62828" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Catmull-Rom → cubic bezier for smooth lines. */
export function smoothPath(points: number[][]) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    d += ` C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export type DonutSegment = { label: string; value: number; color: string };

export function Donut({
  segments,
  centerLabel = "Total",
  size = 168,
}: {
  segments: DonutSegment[];
  centerLabel?: string;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 40;
  const stroke = 20;
  const c = 2 * Math.PI * r;
  const gap = segments.length > 1 ? 1.2 : 0;
  const arcs = segments.reduce<{ seg: DonutSegment; len: number; start: number }[]>((acc, seg) => {
    const prev = acc[acc.length - 1];
    const start = prev ? prev.start + prev.len + gap : 0;
    const len = Math.max(0, (seg.value / total) * c - gap);
    acc.push({ seg, len, start });
    return acc;
  }, []);
  const active = hover !== null ? segments[hover] : null;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="-rotate-90" width={size} height={size} role="img" aria-label={`${centerLabel}: ${total}`}>
        {arcs.map(({ seg, len, start }, i) => (
          <circle
            key={seg.label}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={hover === i ? stroke + 3 : stroke}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-start}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="cursor-pointer transition-[stroke-width]"
          >
            <title>{`${seg.label}: ${seg.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[24.5px] font-bold leading-none text-ink">
          {active ? active.value : formatNumber(segments.reduce((s, x) => s + x.value, 0))}
        </span>
        <span className="mt-1 max-w-[80px] truncate text-xs text-muted">{active ? active.label : centerLabel}</span>
      </div>
    </div>
  );
}

export function DonutLegend({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <ul className="min-w-0 flex-1 space-y-2">
      {segments.map((s) => (
        <li key={s.label} className="flex items-center gap-2.5 text-sm">
          <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: s.color }} />
          <span className="min-w-0 flex-1 truncate text-ink/85">{s.label}</span>
          <span className="whitespace-nowrap tabular-nums text-ink">
            <span className="font-semibold">{s.value}</span>{" "}
            <span className="text-muted">({Math.round((s.value / total) * 100)}%)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The red-family ramp used by the donuts in the designs. */
export const RED_RAMP = ["#b3141b", "#d0393f", "#e05a5f", "#a81f2a", "#ec8a8d", "#f3b3b5", "#c9c3bf"];

export function BarList({
  items,
}: {
  items: { label: string; value: number; color: string; icon?: IconName; display?: string }[];
}) {
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3 text-sm">
          {item.icon ? (
            <Icon name={item.icon} size={15} style={{ color: item.color }} className="shrink-0" />
          ) : (
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: item.color }} />
          )}
          <span className="w-24 shrink-0 truncate text-ink/85">{item.label}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-canvas">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${(item.value / max) * 100 * 0.75}%`, background: item.color }}
            />
          </span>
          <span className="w-[74px] shrink-0 whitespace-nowrap text-right tabular-nums text-ink/80">
            {item.display ?? `${item.value} (${Math.round((item.value / total) * 100)}%)`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Quick actions                                                       */
/* ------------------------------------------------------------------ */

export function QuickTile({
  icon,
  label,
  primary,
  onClick,
}: {
  icon: IconName;
  label: string;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex min-h-[52px] items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
        primary
          ? "border-transparent bg-brand-soft text-brand hover:bg-brand-tint"
          : "border-line bg-white text-ink hover:bg-canvas",
      )}
    >
      <Icon name={icon} size={19} className={primary ? "text-brand" : "text-ink/80"} />
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
    </button>
  );
}

export function LinkRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-xl border border-line/80 bg-white p-3.5 text-left transition hover:border-brand/30 hover:bg-brand-soft/30"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[11.5px] text-muted">{subtitle}</span>
      </span>
      <Icon name="chevronRight" size={18} className="shrink-0 text-ink/70" />
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition",
        checked ? "bg-brand" : "bg-stone-300",
      )}
    >
      <span
        className={cx(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

/** Inline banner for API errors / action results. */
export function Notice({
  tone = "info",
  children,
  onClose,
}: {
  tone?: "info" | "error" | "success";
  children: ReactNode;
  onClose?: () => void;
}) {
  const styles = {
    info: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("mb-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm", styles)}
    >
      <div className="min-w-0">{children}</div>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <Icon name="x" size={16} />
        </button>
      ) : null}
    </div>
  );
}
