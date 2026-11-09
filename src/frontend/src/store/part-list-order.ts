/**
 * Sorting and grouping for the board sidebar's component list (Search tab).
 *
 * Pure and store-free so it can be unit-tested; `SearchTab` in
 * `components/BoardSidebar.tsx` is the only consumer. The persisted choice
 * lives in localStorage (a per-viewer convenience — losing it only resets
 * the list to reference order).
 */

import type { Part } from '../parsers/types';

export type PartSortKey = 'ref' | 'value' | 'package' | 'pins';
export type PartGroupKey = 'none' | 'value' | 'package' | 'prefix' | 'side';

export const PART_SORT_LABELS: Record<PartSortKey, string> = {
  ref: 'Reference',
  value: 'Part number',
  package: 'Package',
  pins: 'Pin count',
};

export const PART_GROUP_LABELS: Record<PartGroupKey, string> = {
  none: 'No grouping',
  value: 'Part number',
  package: 'Package',
  prefix: 'Type (R, C, U…)',
  side: 'Side',
};

/** Label of the group that collects parts without the grouped field. */
export const NO_VALUE_GROUP: Record<Exclude<PartGroupKey, 'none'>, string> = {
  value: 'No part number',
  package: 'No package',
  prefix: 'Other',
  side: 'Other',
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Natural, case-insensitive compare: R2 < R10, c1 = C1. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Reference-designator prefix: the leading letters (`R12` → `R`, `TP3` →
 *  `TP`, `U2_A` → `U`). Empty when the name does not start with a letter. */
export function refPrefix(name: string): string {
  const m = /^[A-Za-z]+/.exec(name.trim());
  return m ? m[0].toUpperCase() : '';
}

function fieldOf(p: Part, key: Exclude<PartGroupKey, 'none'> | Exclude<PartSortKey, 'ref' | 'pins'>): string {
  switch (key) {
    case 'value': return p.meta?.value?.trim() ?? '';
    case 'package': return p.meta?.package?.trim() ?? '';
    case 'prefix': return refPrefix(p.name);
    case 'side': return p.side;
  }
}

/** Compare two parts by `key`. Parts missing the field sort after the rest;
 *  ties fall back to the reference so the order is total and stable. */
export function comparePartsBy(key: PartSortKey): (a: Part, b: Part) => number {
  return (a, b) => {
    let c = 0;
    if (key === 'pins') {
      c = b.pins.length - a.pins.length; // most pins first — the big parts lead
    } else if (key !== 'ref') {
      const av = fieldOf(a, key), bv = fieldOf(b, key);
      if (!av !== !bv) return av ? -1 : 1;
      c = naturalCompare(av, bv);
    }
    return c !== 0 ? c : naturalCompare(a.name, b.name);
  };
}

export function sortParts(parts: readonly Part[], key: PartSortKey): Part[] {
  return [...parts].sort(comparePartsBy(key));
}

export interface PartGroup {
  /** Stable identity (the field value; '' for the no-value group). */
  key: string;
  /** What the header shows. */
  label: string;
  parts: Part[];
}

/**
 * Split parts into groups by `group`, each group sorted by `sort`. Groups are
 * in natural order of their label; the group of parts without the field
 * comes last. Values compare case-insensitively for grouping (`10k` and
 * `10K` are one group, labelled as first seen).
 */
export function groupParts(parts: readonly Part[], group: Exclude<PartGroupKey, 'none'>, sort: PartSortKey): PartGroup[] {
  const byKey = new Map<string, PartGroup>();
  for (const p of parts) {
    const raw = fieldOf(p, group);
    const k = raw.toUpperCase();
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, label: raw || NO_VALUE_GROUP[group], parts: [] };
      byKey.set(k, g);
    }
    g.parts.push(p);
  }
  const cmp = comparePartsBy(sort);
  const groups = [...byKey.values()];
  for (const g of groups) g.parts.sort(cmp);
  groups.sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1;
    return naturalCompare(a.label, b.label);
  });
  return groups;
}

const SORT_STORAGE = 'boardripper-part-list-sort';
const GROUP_STORAGE = 'boardripper-part-list-group';

export function loadPartListOrder(): { sort: PartSortKey; group: PartGroupKey } {
  let sort: PartSortKey = 'ref';
  let group: PartGroupKey = 'none';
  try {
    const s = localStorage.getItem(SORT_STORAGE);
    if (s && s in PART_SORT_LABELS) sort = s as PartSortKey;
    const g = localStorage.getItem(GROUP_STORAGE);
    if (g && g in PART_GROUP_LABELS) group = g as PartGroupKey;
  } catch { /* storage unavailable — defaults */ }
  return { sort, group };
}

export function savePartListOrder(sort: PartSortKey, group: PartGroupKey): void {
  try {
    localStorage.setItem(SORT_STORAGE, sort);
    localStorage.setItem(GROUP_STORAGE, group);
  } catch { /* storage unavailable — choice lasts for the session */ }
}
