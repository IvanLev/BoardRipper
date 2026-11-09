import { describe, it, expect } from 'vitest';
import type { Part } from '../parsers/types';
import { sortParts, groupParts, refPrefix, naturalCompare } from './part-list-order';

function part(name: string, value?: string, pkg?: string, pins = 2, side: 'top' | 'bottom' = 'top'): Part {
  return {
    name, side, type: 'smd', origin: { x: 0, y: 0 },
    pins: Array.from({ length: pins }, (_, i) => ({ name: String(i + 1), number: String(i + 1), position: { x: 0, y: 0 }, radius: 1, side, net: '' })),
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    meta: { ...(value ? { value } : {}), ...(pkg ? { package: pkg } : {}) },
  };
}

const parts = [
  part('R10', '121R2F', '0402'),
  part('R2', '0R2J', '0402'),
  part('U1', 'TPS70933DRV', 'DRV0006A', 7, 'bottom'),
  part('C1', 'SC1U25V2KX', '0402'),
  part('R3', '121r2f', '0402'),
  part('TP1'),
  part('U2', '13156', 'QFN28', 29),
];
const names = (ps: Part[]) => ps.map(p => p.name);

describe('part-list-order', () => {
  it('reference sort is natural (R2 before R10)', () => {
    expect(names(sortParts(parts, 'ref'))).toEqual(['C1', 'R2', 'R3', 'R10', 'TP1', 'U1', 'U2']);
    expect(naturalCompare('R2', 'R10')).toBeLessThan(0);
  });

  it('value sort puts parts without one last, ties by reference', () => {
    expect(names(sortParts(parts, 'value'))).toEqual(['R2', 'R3', 'R10', 'U2', 'C1', 'U1', 'TP1']);
  });

  it('pin-count sort puts the biggest parts first', () => {
    expect(names(sortParts(parts, 'pins')).slice(0, 2)).toEqual(['U2', 'U1']);
  });

  it('groups by value case-insensitively, empty group last', () => {
    const g = groupParts(parts, 'value', 'ref');
    expect(g.map(x => [x.label, names(x.parts)])).toEqual([
      ['0R2J', ['R2']],
      ['121R2F', ['R3', 'R10']],
      ['13156', ['U2']],
      ['SC1U25V2KX', ['C1']],
      ['TPS70933DRV', ['U1']],
      ['No value', ['TP1']],
    ]);
  });

  it('groups by reference prefix and by package', () => {
    expect(groupParts(parts, 'prefix', 'ref').map(x => `${x.label}:${x.parts.length}`)).toEqual(['C:1', 'R:3', 'TP:1', 'U:2']);
    expect(groupParts(parts, 'package', 'ref').map(x => x.label)).toEqual(['0402', 'DRV0006A', 'QFN28', 'No package']);
  });

  it('refPrefix takes the leading letters', () => {
    expect(refPrefix('R12')).toBe('R');
    expect(refPrefix('tp3')).toBe('TP');
    expect(refPrefix('U2_A')).toBe('U');
    expect(refPrefix('1N4148')).toBe('');
  });
});
