import * as React from 'react';

type ClassValue = string | false | null | undefined;
const cx = (...c: ClassValue[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- money
// Copper-equivalent is the only number the UI computes with: 1g = 100s, 1s = 1000c.
export type Unit = 'gold' | 'silver' | 'copper';
export type UnitChoice = Unit | 'mixed';
const COPPER_PER: Record<Unit, number> = { gold: 100_000, silver: 1_000, copper: 1 };
const SUFFIX: Record<Unit, string> = { gold: 'g', silver: 's', copper: 'c' };

/** Same thresholds as the CLI: gold from 1,000,000c, silver from 10,000c. */
export function pickUnit(maxAbsCopper: number): Unit {
  if (maxAbsCopper >= 1_000_000) return 'gold';
  if (maxAbsCopper >= 10_000) return 'silver';
  return 'copper';
}

/** One unit for a whole column: chosen from its largest absolute value. */
export function columnUnit(values: number[], choice: UnitChoice = 'mixed'): Unit {
  if (choice !== 'mixed') return choice;
  return pickUnit(Math.max(0, ...values.map(Math.abs)));
}

export function formatMoney(copper: number, unit: Unit, signed = false): { text: string; suffix: string } {
  const v = copper / COPPER_PER[unit];
  const digits = unit === 'copper' ? 0 : 2;
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const zero = Number(abs.replace(/,/g, '')) === 0;
  const sign = zero ? '' : v < 0 ? '−' : signed ? '+' : '';
  return { text: sign + abs, suffix: SUFFIX[unit] };
}

export interface MoneyProps {
  copper: number;
  unit?: UnitChoice;
  signed?: boolean;
  className?: string;
}

export function Money({ copper, unit = 'mixed', signed = false, className }: MoneyProps) {
  const u = unit === 'mixed' ? pickUnit(Math.abs(copper)) : unit;
  const { text, suffix } = formatMoney(copper, u, signed);
  return (
    <span className={cx('whitespace-nowrap tabular-nums', className)}>
      {text}
      <span className="ml-px text-muted">{suffix}</span>
    </span>
  );
}

// ---------------------------------------------------------------- delta
export interface DeltaChipProps {
  /** Today minus the comparison day, in copper. */
  change: number;
  /** The comparison day's amount; adds a percentage when non-zero. */
  base?: number;
  /** Expense lines invert the colour: spending more is bad for profit. */
  kind?: 'income' | 'expense';
  unit?: UnitChoice;
  className?: string;
}

export function DeltaChip({ change, base, kind = 'income', unit = 'mixed', className }: DeltaChipProps) {
  const u = unit === 'mixed' ? pickUnit(Math.abs(change)) : unit;
  const { text } = formatMoney(change, u, true);
  const flat = !/[1-9]/.test(text);
  const good = kind === 'income' ? change > 0 : change < 0;
  const tone = flat ? 'bg-raised text-muted' : good ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss';
  const pct = base ? (change / Math.abs(base)) * 100 : null;
  const pctText = pct === null ? null : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(1)}%`;
  return (
    <span className={cx('type-micro inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 whitespace-nowrap tabular-nums', tone, className)}>
      <span aria-hidden="true">{flat ? '–' : change > 0 ? '▲' : '▼'}</span>
      <Money copper={change} unit={u} signed className="[&>span]:text-current" />
      {pctText && <span className="opacity-80">({pctText})</span>}
      <span className="sr-only">{flat ? 'unchanged' : good ? 'better for profit' : 'worse for profit'}</span>
    </span>
  );
}

// ---------------------------------------------------------------- layout
export interface PanelProps {
  title?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  /** false for edge-to-edge content such as a table. */
  padded?: boolean;
  className?: string;
}

export function Panel({ title, eyebrow, actions, children, padded = true, className }: PanelProps) {
  const hasHeader = title || eyebrow || actions;
  return (
    <section className={cx('min-w-0 rounded-lg border border-line bg-panel', className)}>
      {hasHeader && (
        <header className={cx('flex flex-wrap items-center justify-between gap-2 px-4 pt-4', !padded && 'pb-3')}>
          <div className="min-w-0">
            {eyebrow && <p className="type-eyebrow uppercase text-muted">{eyebrow}</p>}
            {title && <h2 className="type-title text-ink">{title}</h2>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx(padded && 'p-4', padded && !!hasHeader && 'pt-3')}>{children}</div>
    </section>
  );
}

export interface StatTileProps {
  label: string;
  copper: number;
  unit?: UnitChoice;
  delta?: React.ReactNode;
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function StatTile({ label, copper, unit = 'mixed', delta, caption, icon, className }: StatTileProps) {
  return (
    <div className={cx('flex min-w-0 gap-3 rounded-lg border border-line bg-panel p-4', className)}>
      {icon && <div className="mt-0.5 shrink-0 text-accent-ink">{icon}</div>}
      <div className="min-w-0">
        <p className="type-label text-muted">{label}</p>
        <p className="type-kpi text-ink">
          <Money copper={copper} unit={unit} />
        </p>
        {(delta || caption) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {delta}
            {caption && <span className="type-label text-muted">{caption}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- actions
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

const BUTTON_VARIANT = {
  primary: 'border-accent bg-accent text-on-accent hover:bg-accent/85',
  secondary: 'border-line-strong bg-raised text-ink hover:bg-line',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-raised hover:text-ink',
};
const BUTTON_SIZE = { sm: 'h-7 px-2.5 type-small', md: 'h-8 px-3 type-body' };

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap transition-colors',
        'disabled:pointer-events-none disabled:opacity-45',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}
export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Read by screen readers: what the choice controls. */
  label: string;
  className?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex gap-0.5 rounded-md border border-line bg-bg p-0.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'type-small h-7 rounded-sm px-2.5 font-medium transition-colors',
              on ? 'bg-accent-soft text-accent-ink ring-1 ring-inset ring-accent-ink/50' : 'text-muted hover:bg-raised hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface NavItem {
  id: string;
  label: string;
  count?: number;
}
export interface NavTabsProps {
  items: NavItem[];
  active: string;
  onSelect?: (id: string) => void;
  className?: string;
}

export function NavTabs({ items, active, onSelect, className }: NavTabsProps) {
  return (
    <nav className={cx('flex flex-wrap gap-1', className)}>
      {items.map((it) => {
        const on = it.id === active;
        return (
          <a
            key={it.id}
            href={`#${it.id}`}
            aria-current={on ? 'page' : undefined}
            onClick={(e) => {
              if (onSelect) {
                e.preventDefault();
                onSelect(it.id);
              }
            }}
            className={cx(
              'type-body inline-flex h-8 items-center gap-1.5 rounded-md border px-3 transition-colors',
              on ? 'border-line-strong bg-panel text-accent-ink' : 'border-transparent text-ink hover:bg-raised',
            )}
          >
            {it.label}
            {it.count !== undefined && <span className="type-micro rounded-full bg-raised px-1.5 text-muted">{it.count}</span>}
          </a>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------- data
export type SeriesKey = 'sundries' | 'potion' | 'beverage' | 'jewelry' | 'relic' | 'orders' | 'quests' | 'purchasing';

/** Fixed entity → colour. The order is the validated stack order; never re-cycle colours by rank. */
export const SERIES: { key: SeriesKey; label: string; bg: string; token: string }[] = [
  { key: 'sundries', label: 'Sundries', bg: 'bg-sundries', token: '--series-sundries' },
  { key: 'potion', label: 'Potion', bg: 'bg-potion', token: '--series-potion' },
  { key: 'beverage', label: 'Beverage', bg: 'bg-beverage', token: '--series-beverage' },
  { key: 'jewelry', label: 'Jewelry', bg: 'bg-jewelry', token: '--series-jewelry' },
  { key: 'relic', label: 'Relic', bg: 'bg-relic', token: '--series-relic' },
  { key: 'orders', label: 'Orders', bg: 'bg-orders', token: '--series-orders' },
  { key: 'quests', label: 'Quests', bg: 'bg-quests', token: '--series-quests' },
  { key: 'purchasing', label: 'Purchasing', bg: 'bg-purchasing', token: '--series-purchasing' },
];
const seriesOf = (k: SeriesKey) => SERIES.find((s) => s.key === k)!;

export interface SeriesLegendProps {
  series: SeriesKey[];
  className?: string;
}

export function SeriesLegend({ series, className }: SeriesLegendProps) {
  return (
    <ul className={cx('flex flex-wrap gap-x-4 gap-y-1', className)}>
      {series.map((k) => {
        const s = seriesOf(k);
        return (
          <li key={k} className="type-small inline-flex items-center gap-1.5 text-ink">
            <span aria-hidden="true" className={cx('size-2.5 rounded-xs', s.bg)} />
            {s.label}
          </li>
        );
      })}
    </ul>
  );
}

export interface ShareBarProps {
  /** 0–1 share of the whole. */
  fraction: number;
  series: SeriesKey;
  className?: string;
}

export function ShareBar({ fraction, series, className }: ShareBarProps) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <span className={cx('inline-flex w-full min-w-16 items-center gap-2', className)}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
        <span className={cx('block h-full rounded-full', seriesOf(series).bg)} style={{ width: `${pct}%` }} />
      </span>
      <span className="type-micro w-10 text-end text-muted tabular-nums">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
    </span>
  );
}

const ICON_TINT: Record<string, string> = {
  sundries: 'bg-sundries/25',
  potion: 'bg-potion/25',
  beverage: 'bg-beverage/25',
  jewelry: 'bg-jewelry/25',
  relic: 'bg-relic/25',
  orders: 'bg-orders/25',
  quests: 'bg-quests/25',
  purchasing: 'bg-purchasing/25',
};

export interface ItemLabelProps {
  /** In-game display name, e.g. "Transformation Potion". */
  name: string;
  /** Tints the lettered tile; omit for purchased materials. */
  series?: SeriesKey;
  /** An item icon (image URL) from `assets/icons/`. Without one, a lettered tile stands in. */
  iconSrc?: string;
  detail?: React.ReactNode;
  className?: string;
}

export function ItemLabel({ name, series, iconSrc, detail, className }: ItemLabelProps) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-2', className)}>
      {iconSrc ? (
        <img src={iconSrc} alt="" className="size-6 shrink-0 rounded-xs object-contain" />
      ) : (
        <span
          aria-hidden="true"
          className={cx('type-micro grid size-6 shrink-0 place-items-center rounded-xs font-semibold text-ink', series ? ICON_TINT[series] : 'bg-raised')}
        >
          {initials}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-ink">{name}</span>
        {detail && <span className="type-label block text-muted">{detail}</span>}
      </span>
    </span>
  );
}

export interface LedgerColumn {
  header: React.ReactNode;
  /** Money and counts align end. */
  align?: 'start' | 'end';
  className?: string;
}
export interface LedgerTableProps {
  columns: LedgerColumn[];
  rows: React.ReactNode[][];
  footer?: React.ReactNode[];
  caption?: string;
  className?: string;
  /** Click target with pointer and hover. Put a handler-free button in the label cell; its click bubbles here. */
  rowAction?: (rowIndex: number) => (() => void) | undefined;
  rowSelected?: (rowIndex: number) => boolean;
  /** Full-width detail directly below the row, without hover styling. */
  rowDetail?: (rowIndex: number) => React.ReactNode;
}

export function LedgerTable({ columns, rows, footer, caption, className, rowAction, rowSelected, rowDetail }: LedgerTableProps) {
  const align = (i: number) => (columns[i]?.align === 'end' ? 'text-end' : 'text-start');
  return (
    <div className={cx('min-w-0 overflow-x-auto', className)}>
      <table className="w-full border-collapse tabular-nums">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col" className={cx('type-label border-b border-line px-4 py-2 font-medium text-muted', align(i), c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const action = rowAction?.(ri), detail = rowDetail?.(ri);
            return <React.Fragment key={ri}>
            <tr onClick={action} className={cx('hover:bg-raised/60', !!action && 'cursor-pointer', rowSelected?.(ri) && 'bg-accent-soft')}>
              {r.map((cell, ci) => (
                <td key={ci} className={cx('type-body border-b border-line/60 px-4 py-1.5 align-middle', align(ci), columns[ci]?.className)}>
                  {cell}
                </td>
              ))}
            </tr>
            {detail != null && <tr><td colSpan={columns.length}>{detail}</td></tr>}
            </React.Fragment>;
          })}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              {footer.map((cell, ci) => (
                <td key={ci} className={cx('type-heading border-t border-line-strong px-4 py-2 text-ink', align(ci), columns[ci]?.className)}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- feedback
export interface NoticeProps {
  /** estimate: computed, not stored (quest rewards). missing: data the ledger cannot price. */
  tone?: 'info' | 'estimate' | 'missing';
  children: React.ReactNode;
  className?: string;
}

const NOTICE_ICON = {
  info: 'M8 7v4M8 5h.01',
  estimate: 'M4.5 9.5c1-1.5 2-1.5 3.5 0s2.5 1.5 3.5 0',
  missing: 'M8 4.5v4M8 11h.01',
};
const NOTICE_TONE = { info: 'text-muted', estimate: 'text-violet', missing: 'text-accent-ink' };

export function Notice({ tone = 'info', children, className }: NoticeProps) {
  return (
    <p className={cx('type-small flex items-start gap-2 rounded-md bg-raised px-3 py-2 text-muted', className)}>
      <svg viewBox="0 0 16 16" aria-hidden="true" className={cx('mt-px size-4 shrink-0', NOTICE_TONE[tone])} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.25" />
        <path d={NOTICE_ICON[tone]} />
      </svg>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
