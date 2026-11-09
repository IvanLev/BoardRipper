import { describe, it, expect } from 'vitest';
import { outerCopperLayers, createLayerStates } from './layer-store';

describe('outerCopperLayers', () => {
  it('finds the top and bottom copper layers by name', () => {
    expect(outerCopperLayers(['Top', 'L3', 'L2', 'Bottom'])).toEqual({ top: 0, bottom: 3 });
    expect(outerCopperLayers(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'])).toEqual({ top: 0, bottom: 3 });
    expect(outerCopperLayers(['TOP', 'GND', 'PWR', 'BOTTOM'])).toEqual({ top: 0, bottom: 3 });
  });
  it('falls back to the first and last layer', () => {
    expect(outerCopperLayers(['Signal1', 'Signal2', 'Signal3'])).toEqual({ top: 0, bottom: 2 });
    expect(outerCopperLayers([])).toEqual({ top: -1, bottom: -1 });
  });
});

describe('createLayerStates with routing following the side', () => {
  it('keeps the outer layers on and starts inner layers off', () => {
    const s = createLayerStates(['Top', 'L3', 'L2', 'Bottom'], undefined, true, true);
    expect(s.map(l => l.visible)).toEqual([true, false, false, true]);
  });
  it('is unchanged with the setting off', () => {
    const s = createLayerStates(['Top', 'L3', 'L2', 'Bottom'], undefined, true, false);
    expect(s.map(l => l.visible)).toEqual([true, true, true, true]);
  });
});
