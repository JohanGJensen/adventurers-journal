import { describe, expect, test } from 'bun:test';
import { hasTool, toolRules } from '../src/data/tools';

describe('toolRules', () => {
  test('matches curly and straight apostrophes, any case', () => {
    expect(toolRules('Cartographer’s Tools')?.ability).toBe('WIS');
    expect(toolRules("cartographer's tools")?.utilize).toEqual([{ action: 'Draft a map of a small area', dc: 15 }]);
  });
  test('maps gaming sets and instruments to their family', () => {
    expect(toolRules('Dice Set')?.utilize[1]).toEqual({ action: 'Win the game', dc: 20 });
    expect(toolRules('Lute')?.ability).toBe('CHA');
  });
  test('unknown tools have no rules', () => {
    expect(toolRules('Sky-Whale Harpoon')).toBeNull();
  });
  test('hasTool ignores quote style', () => {
    expect(hasTool([{ name: 'Cartographer’s Tools' }], "Cartographer's Tools")).toBe(true);
  });
});
