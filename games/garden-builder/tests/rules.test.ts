import { describe, it, expect } from 'vitest';
import { Builder, parseSave } from '../src/game';
import { BLUEPRINT, PARTS, landing, complete, dimensions, nextHint, placementError, starter, tasks, type Placement } from '../src/rules';
const p = (kind: Placement['kind'], x: number, z: number, y = 0, rotation = 0): Placement => ({ kind, x, z, y, rotation });
describe('individual brick construction', () => {
  it('offers raw bricks, independent frames and individual tiles, never finished walls or houses', () => {
    expect(Object.keys(PARTS)).toEqual(['brick', 'half', 'lintel', 'door', 'window', 'tile', 'ridge', 'soil', 'water', 'fence']);
    expect(dimensions(p('brick', 0, 0))).toEqual({ w: 2, d: 1, h: 1 });
    expect(dimensions(p('brick', 0, 0, 0, 1))).toEqual({ w: 1, d: 2, h: 1 });
  });
  it('requires mortar before placing masonry and rejects unsupported or overlapping bricks', () => {
    const b = new Builder({ template: 'empty' });
    expect(b.place(p('brick', 0, 0))).toContain('砂浆'); expect(b.pieces).toHaveLength(0);
    expect(b.place(p('brick', 0, 0), true)).toBeNull();
    expect(b.place(p('half', 1, 0), true)).toContain('已有');
    expect(b.place(p('brick', 0, 0, 1), true)).toBeNull();
    expect(b.place(p('brick', 1, 0, 2), true)).toContain('支撑');
    expect(b.place(p('brick', 23, 0), true)).toContain('边界');
    expect(b.place(p('brick', 1, 1, 17), true)).toContain('边界');
    expect(b.place(p('half', 1.5, 1), true)).toContain('无效');
    expect(b.place(p('fence', 5, 5, 1))).toContain('地面');
    expect(b.place(p('tile', 6, 6))).toContain('先砌墙');
    expect(b.remove(1)).toContain('托着');
  });
  it('automatically lands on empty ground, stacked bricks and tall frames without floating or tunneling', () => {
    const b = new Builder({ template: 'empty' });
    expect(landing(b.pieces, p('brick', 15, 15, 8)).y).toBe(0);
    b.place(p('brick', 15, 15), true);
    expect(landing(b.pieces, p('brick', 15, 15)).y).toBe(1);
    b.place(landing(b.pieces, p('brick', 15, 15)), true);
    expect(landing(b.pieces, p('brick', 15, 15)).y).toBe(2);
    expect(landing(b.pieces, p('brick', 15, 16, 8)).y).toBe(0);
    const overhang = landing(b.pieces, p('brick', 16, 15));
    expect(overhang.y).toBe(2); expect(placementError(b.pieces, overhang)).toContain('支撑');
    b.place(p('door', 0, 0)); expect(landing(b.pieces, p('brick', 0, 0)).y).toBe(5);
    expect(landing(b.pieces, p('fence', 0, 0)).y).toBe(0);
  });
  it('automatically locates every supported course including adjacent sloping roof tiles', () => {
    const b = new Builder({ template: 'empty' });
    for (const item of BLUEPRINT) {
      const automatic = landing(b.pieces, { ...item, y: 16 });
      expect(automatic.y, JSON.stringify(item)).toBe(item.y);
      expect(b.place(automatic, true)).toBeNull();
    }
  });
  it('bridges a door gap with a lintel supported at both ends and preserves frame openings', () => {
    const b = new Builder({ template: 'empty' });
    b.place(p('half', 0, 0), true);
    expect(b.place(p('lintel', 0, 0, 1), true)).toContain('两端');
    b.place(p('half', 3, 0), true); expect(b.place(p('lintel', 0, 0, 1), true)).toBeNull();
    expect(b.place(p('brick', 1, 0, 2), true)).toBeNull();
    expect(b.remove(1)).toContain('托着');
    const frames = new Builder({ template: 'empty' }); frames.place(p('door', 0, 0));
    expect(frames.place(p('brick', 0, 0, 3), true)).toContain('已有');
    expect(frames.place(p('brick', 0, 0, 5), true)).toBeNull();
  });
  it('requires all four brick borders before adding soil or a fish tank', () => {
    const b = new Builder({ template: 'empty' });
    expect(b.place(p('soil', 1, 1))).toContain('围好');
    for (const z of [0, 3]) { b.place(p('brick', 0, z), true); b.place(p('brick', 2, z), true); }
    b.place(p('brick', 0, 1, 0, 1), true); b.place(p('brick', 3, 1, 0, 1), true);
    expect(b.place(p('soil', 1, 1))).toBeNull(); expect(b.remove(1)).toContain('内胆');
    expect(b.remove(7)).toBeNull(); expect(b.remove(1)).toBeNull();
  });
  it('builds the entire reference blueprint one legal item at a time', () => {
    const b = new Builder({ template: 'empty' });
    for (const item of BLUEPRINT) expect(b.place(item, true), JSON.stringify(item)).toBeNull();
    expect(complete(b.pieces)).toBe(true); expect(nextHint(b.pieces)).toBeUndefined();
    const tile = b.pieces.find(q => q.kind === 'tile')!; expect(b.remove(tile.id)).toContain('托着');
    const ridge = b.pieces.find(q => q.kind === 'ridge')!; b.remove(ridge.id); expect(complete(b.pieces)).toBe(false);
    b.undo(); expect(complete(b.pieces)).toBe(true); b.redo(); expect(complete(b.pieces)).toBe(false);
  });
  it('continues the starter deterministically and can finish using only single-piece hints', () => {
    const b = new Builder(); expect(b.pieces).toHaveLength(27); expect(b.pieces).toEqual(starter({ template: 'starter' }));
    let steps = 0;
    while (nextHint(b.pieces) && steps < 400) { expect(b.place(nextHint(b.pieces)!, true)).toBeNull(); steps++; }
    expect(complete(b.pieces)).toBe(true); expect(steps).toBe(BLUEPRINT.length - 27);
    expect(tasks(b.pieces).every(task => task.value === task.target)).toBe(true);
  });
});
describe('history and defensive save restore', () => {
  it('persists individual actions, redo history and effective settings', () => {
    const b = new Builder({ template: 'empty' }); b.place(p('brick', 0, 0), true); b.place(p('half', 2, 0), true); b.undo();
    const restored = new Builder(undefined, parseSave(JSON.parse(JSON.stringify(b.state)))!); restored.redo(); expect(restored.pieces).toHaveLength(2);
    restored.undo(); restored.place(p('half', 3, 0), true); expect(restored.state.future).toHaveLength(0); expect(restored.state.settings.template).toBe('empty');
  });
  it('rejects old module saves, malformed entries, duplicate ids, overlaps and floating bricks', () => {
    const good = new Builder().state;
    for (const value of [null, {}, { ...good, version: 1 }, { ...good, settings: null }, { ...good, past: [null] }, { ...good, current: { pieces: [null], finished: false } }]) expect(parseSave(value)).toBeNull();
    const duplicate = structuredClone(good); duplicate.current.pieces.push(duplicate.current.pieces[0]); expect(parseSave(duplicate)).toBeNull();
    const floating = structuredClone(good); floating.current.pieces[0].y = 10; expect(parseSave(floating)).toBeNull();
    expect(parseSave(good)).toEqual(good);
  });
  it('keeps a bounded history and validates all stored support relationships', () => {
    const b = new Builder({ template: 'empty' });
    for (let i = 0; i < 80; i++) { b.place(p('half', 0, 0), true); b.remove(b.pieces[0].id); }
    expect(b.state.past).toHaveLength(60); expect(parseSave(b.state)).not.toBeNull();
    const pieces = starter({ template: 'starter' }); expect(pieces.every(q => !placementError(pieces.filter(r => q.id !== r.id), q))).toBe(true);
  });
});
