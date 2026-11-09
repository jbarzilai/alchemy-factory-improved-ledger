import type * as React from 'react';

export type Unit = 'gold' | 'silver' | 'copper';
export type UnitChoice = Unit | 'mixed';
export type SeriesKey = 'sundries' | 'potion' | 'beverage' | 'jewelry' | 'relic' | 'orders' | 'quests' | 'minted' | 'purchasing' | 'melted';

/** Gold from 1,000,000c, silver from 10,000c, else copper (same as the CLI). */
export function pickUnit(maxAbsCopper: number): Unit;
/** One unit for a whole column, from its largest absolute value. */
export function columnUnit(values: number[], choice?: UnitChoice): Unit;
export function formatMoney(copper: number, unit: Unit, signed?: boolean): { text: string; suffix: string };
export const SERIES: { key: SeriesKey; label: string; bg: string; token: string }[];

export interface MoneyProps {
  /** Copper-equivalent: 1g = 100,000c, 1s = 1,000c. */
  copper: number;
  unit?: UnitChoice;
  signed?: boolean;
  className?: string;
}
export function Money(props: MoneyProps): React.JSX.Element;

export interface DeltaChipProps {
  /** Today minus the comparison day, in copper. */
  change: number;
  /** The comparison day's amount; adds a percentage when non-zero. */
  base?: number;
  /** expense inverts the colour: spending more is worse for profit. */
  kind?: 'income' | 'expense';
  unit?: UnitChoice;
  className?: string;
}
export function DeltaChip(props: DeltaChipProps): React.JSX.Element;

export interface PanelProps {
  title?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  /** false for edge-to-edge content such as a table. */
  padded?: boolean;
  className?: string;
}
export function Panel(props: PanelProps): React.JSX.Element;

export interface StatTileProps {
  label: string;
  copper: number;
  unit?: UnitChoice;
  delta?: React.ReactNode;
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}
export function StatTile(props: StatTileProps): React.JSX.Element;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}
export function Button(props: ButtonProps): React.JSX.Element;

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}
export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What the choice controls, for screen readers. */
  label: string;
  className?: string;
}
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>): React.JSX.Element;

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
export function NavTabs(props: NavTabsProps): React.JSX.Element;

export interface SeriesLegendProps {
  series: SeriesKey[];
  className?: string;
}
export function SeriesLegend(props: SeriesLegendProps): React.JSX.Element;

export interface ShareBarProps {
  /** 0–1 share of the whole. */
  fraction: number;
  series: SeriesKey;
  className?: string;
}
export function ShareBar(props: ShareBarProps): React.JSX.Element;

export interface ItemLabelProps {
  /** In-game display name, e.g. "Transformation Potion". */
  name: string;
  /** Tints the lettered tile; omit for purchased materials. */
  series?: SeriesKey;
  /** An item icon from `assets/icons/`. Without one, a lettered tile stands in. */
  iconSrc?: string;
  detail?: React.ReactNode;
  className?: string;
}
export function ItemLabel(props: ItemLabelProps): React.JSX.Element;

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
export function LedgerTable(props: LedgerTableProps): React.JSX.Element;

export interface NoticeProps {
  /** estimate: computed, not stored (quest rewards). missing: data the ledger cannot price. */
  tone?: 'info' | 'estimate' | 'missing';
  children: React.ReactNode;
  className?: string;
}
export function Notice(props: NoticeProps): React.JSX.Element;
