import { DEFAULT_SETTINGS, PARTS, placementError, removalError, starter, type Piece, type Placement, type Settings } from './rules';
export const SAVE_KEY = 'garden-builder-save-v2';
export const PREF_KEY = 'garden-builder-preferences-v1';
type Snapshot = { pieces: Piece[]; finished: boolean };
export type Save = { version: 2; settings: Settings; current: Snapshot; past: Snapshot[]; future: Snapshot[]; edited: boolean };
const clone = <T>(value: T): T => structuredClone(value);
export class Builder {
  state: Save;
  constructor(settings: Settings = DEFAULT_SETTINGS, saved?: Save) {
    this.state = saved ?? { version: 2, settings: { ...settings }, current: { pieces: starter(settings), finished: false }, past: [], future: [], edited: false };
  }
  get pieces() { return this.state.current.pieces; }
  private commit(pieces: Piece[]) {
    this.state.past.push(clone(this.state.current));
    if (this.state.past.length > 60) this.state.past.shift();
    this.state.current = { pieces, finished: false }; this.state.future = []; this.state.edited = true;
  }
  place(p: Placement, mortar = false) {
    if (this.pieces.length >= 1500) return '地块最多容纳 1500 件材料，请先拆除一些再继续';
    if (PARTS[p.kind]?.mortar && !mortar) return '先抹一层砂浆，再放这块砖';
    const error = placementError(this.pieces, p);
    if (error) return error;
    this.commit([...this.pieces, { ...p, id: Math.max(0, ...this.pieces.map(q => q.id)) + 1 }]);
    return null;
  }
  remove(id: number) {
    const error = removalError(this.pieces, id);
    if (error) return error;
    this.commit(this.pieces.filter(p => p.id !== id)); return null;
  }
  undo() {
    const previous = this.state.past.pop();
    if (!previous) return;
    this.state.future.push(clone(this.state.current)); this.state.current = previous; this.state.edited = true;
  }
  redo() {
    const next = this.state.future.pop();
    if (!next) return;
    this.state.past.push(clone(this.state.current)); this.state.current = next; this.state.edited = true;
  }
}
function validSnapshot(value: unknown): value is Snapshot {
  const s = value as Snapshot;
  if (!s || typeof s.finished !== 'boolean' || !Array.isArray(s.pieces) || s.pieces.length > 1500) return false;
  const ids = new Set<number>(), accepted: Piece[] = [];
  for (const p of [...s.pieces].sort((a, b) => (a?.y ?? 0) - (b?.y ?? 0))) {
    if (!p || !Object.hasOwn(PARTS, p.kind) || !Number.isSafeInteger(p.id) || p.id <= 0 || ids.has(p.id) || placementError(accepted, p)) return false;
    ids.add(p.id); accepted.push(p);
  }
  return true;
}
export function parseSave(value: unknown): Save | null {
  const s = value as Save;
  if (!s || s.version !== 2 || !['starter', 'empty'].includes(s.settings?.template) || typeof s.edited !== 'boolean' || !validSnapshot(s.current)) return null;
  if (![s.past, s.future].every(list => Array.isArray(list) && list.length <= 60 && list.every(validSnapshot))) return null;
  return clone(s);
}
export function loadSave() {
  try { return parseSave(JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')); } catch { return null; }
}
export function save(state: Save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
