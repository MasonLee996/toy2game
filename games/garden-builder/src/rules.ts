export const SIZE = 24;
export const CELL = 0.5;
export const HEIGHT = 0.3;
export const MAX_LAYER = 16;
// Dimensions are in half-brick cells and brick courses, not prefabricated walls.
export const PARTS = {
  brick: { name: '整块红砖', group: 'structure', w: 2, d: 1, h: 1, description: '一块长砖 · 可横放、转向、错缝砌筑', support: true, ground: false, mortar: true },
  half: { name: '半块红砖', group: 'structure', w: 1, d: 1, h: 1, description: '收边与错缝用的半砖', support: true, ground: false, mortar: true },
  lintel: { name: '长条过梁', group: 'structure', w: 4, d: 1, h: 1, description: '跨过门洞或窗洞 · 两端需要砖托住', support: true, ground: false, mortar: true },
  door: { name: '独立门框', group: 'structure', w: 2, d: 1, h: 5, description: '先留门洞，再装门框 · 两侧继续砌砖', support: true, ground: false, mortar: false },
  window: { name: '独立窗框', group: 'structure', w: 2, d: 1, h: 3, description: '窗框是单独配件，不附带一整面墙', support: true, ground: false, mortar: false },
  tile: { name: '单片灰瓦', group: 'roof', w: 2, d: 2, h: 1, description: '一片斜瓦 · 从檐口向屋脊逐片搭接', support: true, ground: false, mortar: false },
  ridge: { name: '屋脊瓦', group: 'roof', w: 2, d: 2, h: 1, description: '两面斜瓦合拢后，盖住中间的接缝', support: false, ground: false, mortar: false },
  soil: { name: '泥土与菜苗', group: 'garden', w: 2, d: 2, h: 1, description: '先用砖围出 2 × 2 格内空，再填土种菜', support: false, ground: true, mortar: false },
  water: { name: '鱼池内胆', group: 'garden', w: 4, d: 2, h: 1, description: '先用砖围出 4 × 2 格内空，再放入水池', support: false, ground: true, mortar: false },
  fence: { name: '白栅栏配件', group: 'garden', w: 2, d: 1, h: 2, description: '参考图中的独立白色栅栏配件', support: false, ground: true, mortar: false },
} as const;
export type Kind = keyof typeof PARTS;
export type Group = typeof PARTS[Kind]['group'];
export type Piece = { id: number; kind: Kind; x: number; z: number; y: number; rotation: number };
export type Placement = Omit<Piece, 'id'>;
export type Settings = { template: 'starter' | 'empty' };
export const DEFAULT_SETTINGS: Settings = { template: 'starter' };
export function dimensions(p: Placement) {
  const part = PARTS[p.kind];
  return { w: p.rotation % 2 ? part.d : part.w, d: p.rotation % 2 ? part.w : part.d, h: part.h };
}
export function cells(p: Placement): [number, number][] {
  const { w, d } = dimensions(p);
  return Array.from({ length: w * d }, (_, i) => [p.x + i % w, p.z + Math.floor(i / w)]);
}
export function occupies(p: Placement, x: number, z: number, y = p.y) {
  const { w, d, h } = dimensions(p);
  return x >= p.x && x < p.x + w && z >= p.z && z < p.z + d && y >= p.y && y < p.y + h;
}
function highEdge(p: Placement, x: number, z: number) {
  const { w, d } = dimensions(p);
  return p.rotation === 0 ? x === p.x + w - 1 : p.rotation === 1 ? z === p.z : p.rotation === 2 ? x === p.x : z === p.z + d - 1;
}
export function supportAt(pieces: Piece[], x: number, z: number, top: number) {
  return pieces.some(p => p.y + PARTS[p.kind].h === top && PARTS[p.kind].support && occupies(p, x, z) && (p.kind !== 'tile' || highEdge(p, x, z)));
}
function enclosed(pieces: Piece[], p: Placement) {
  const { w, d } = dimensions(p), wall = (x: number, z: number) => pieces.some(q => ['brick', 'half'].includes(q.kind) && q.y === 0 && occupies(q, x, z));
  return Array.from({ length: w }, (_, i) => i).every(i => wall(p.x + i, p.z - 1) && wall(p.x + i, p.z + d)) &&
    Array.from({ length: d }, (_, i) => i).every(i => wall(p.x - 1, p.z + i) && wall(p.x + w, p.z + i));
}
export function placementError(pieces: Piece[], p: Placement): string | null {
  if (!Object.hasOwn(PARTS, p.kind) || ![p.x, p.z, p.y, p.rotation].every(Number.isInteger)) return '部件信息无效';
  const part = PARTS[p.kind], { w, d, h } = dimensions(p);
  if (p.x < 0 || p.z < 0 || p.x + w > SIZE || p.z + d > SIZE || p.y < 0 || p.y + h > MAX_LAYER + 1 || p.rotation < 0 || p.rotation > 3) return '超出地块或高度边界';
  if (part.ground && p.y !== 0) return '庭院配件请放在地面';
  if (pieces.some(q => p.y < q.y + PARTS[q.kind].h && q.y < p.y + h && cells(p).some(([x, z]) => occupies(q, x, z)))) return '这里已有材料，请移到空位';
  if (p.kind === 'soil' || p.kind === 'water') return enclosed(pieces, p) ? null : '先用整砖或半砖围好四边，再放入内胆或泥土';
  if ((p.kind === 'tile' || p.kind === 'ridge') && p.y === 0) return '先砌墙，再从檐口逐片铺瓦';
  if (p.y > 0) {
    const supported = cells(p).filter(([x, z]) => supportAt(pieces, x, z, p.y));
    if (p.kind === 'lintel') {
      const ends = p.rotation % 2 ? [[p.x, p.z], [p.x, p.z + d - 1]] : [[p.x, p.z], [p.x + w - 1, p.z]];
      if (!ends.every(([x, z]) => supportAt(pieces, x, z, p.y))) return '过梁两端需要下层砖支撑';
    } else if (p.kind === 'tile') {
      // A tile either rests on an eave or overlaps the high edge of the previous course.
      const edge = p.rotation === 0 ? [[p.x - 1, p.z], [p.x - 1, p.z + 1]] : p.rotation === 1 ? [[p.x, p.z + d], [p.x + 1, p.z + d]] : p.rotation === 2 ? [[p.x + w, p.z], [p.x + w, p.z + 1]] : [[p.x, p.z - 1], [p.x + 1, p.z - 1]];
      if (supported.length < 2 && !edge.every(([x, z]) => pieces.some(q => q.kind === 'tile' && q.rotation === p.rotation && q.y + 1 === p.y && occupies(q, x, z) && highEdge(q, x, z)))) return '斜瓦需要檐墙，或搭在低一皮相邻瓦片的高边';
    } else if (p.kind === 'ridge') {
      if (supported.length < 2) return '屋脊下面需要两面斜瓦的高边支撑';
    } else if (supported.length !== w * d) return '下面缺少支撑，请先砌下层砖或放好过梁';
  }
  return null;
}
// Drop onto the highest occupied surface under the footprint. Unsupported overhangs
// stay invalid instead of passing through existing pieces to a lower floor.
export function landing(pieces: Piece[], p: Placement): Placement {
  if (PARTS[p.kind].ground) return { ...p, y: 0 };
  const footprint = cells(p);
  const y = Math.max(0, ...pieces.filter(q => footprint.some(([x, z]) => occupies(q, x, z))).map(q => q.y + PARTS[q.kind].h));
  const result = { ...p, y };
  // Sloping tiles can also rest on the adjoining tile's high edge.
  if (p.kind === 'tile') {
    const heights = [...new Set(pieces.filter(q => q.kind === 'tile').map(q => q.y + 1))].filter(top => top >= y).sort((a, b) => b - a);
    for (const top of heights) if (!placementError(pieces, { ...p, y: top })) return { ...p, y: top };
  }
  return result;
}
export function removalError(pieces: Piece[], id: number) {
  const target = pieces.find(p => p.id === id);
  if (!target) return '这里没有可拆除的材料';
  const rest = pieces.filter(p => p.id !== id);
  if (rest.some(p => placementError(rest.filter(q => q.id !== p.id), p))) return '它还托着上层材料或围着内胆，请先拆上层或取出填充物';
  return null;
}
function makeBlueprint() {
  const plan: Placement[] = [];
  const add = (kind: Kind, x: number, z: number, y = 0, rotation = 0) => plan.push({ kind, x, z, y, rotation });
  for (let y = 0; y < 8; y++) {
    if (y === 2) { add('window', 8, 10, y); add('window', 10, 6, y, 1); }
    for (const z of [3, 10]) {
      for (let x = 3; x <= 10;) {
        const blocked = (n: number) => z === 10 && (y < 5 && n >= 5 && n <= 6 || y >= 2 && y < 5 && n >= 8 && n <= 9);
        if (blocked(x)) { x++; continue; }
        const length = x < 10 && !blocked(x + 1) && !(y % 2 && x === 3) ? 2 : 1;
        add(length === 2 ? 'brick' : 'half', x, z, y); x += length;
      }
    }
    for (const x of [3, 10]) for (let z = 4; z <= 9;) {
      const blocked = (n: number) => x === 10 && y >= 2 && y < 5 && n >= 6 && n <= 7;
      if (blocked(z)) { z++; continue; }
      const length = z < 9 && !blocked(z + 1) && !(y % 2 && z === 4) ? 2 : 1;
      add(length === 2 ? 'brick' : 'half', x, z, y, 1); z += length;
    }
    if (y === 0) add('door', 5, 10);
  }
  for (const z of [3, 5, 7, 9]) { add('tile', 3, z, 8); add('tile', 9, z, 8, 2); }
  for (const z of [3, 5, 7, 9]) { add('tile', 5, z, 9); add('tile', 7, z, 9, 2); }
  for (const z of [3, 5, 7, 9]) add('ridge', 6, z, 10);
  const bed = (x: number, z: number, innerWidth: number, fill: 'soil' | 'water') => {
    for (const row of [z, z + 3]) for (let i = 0; i < innerWidth + 2; i += 2) add('brick', x + i, row);
    for (const column of [x, x + innerWidth + 1]) add('brick', column, z + 1, 0, 1);
    add(fill, x + 1, z + 1);
  };
  bed(15, 4, 4, 'water'); bed(15, 13, 2, 'soil'); bed(15, 19, 2, 'soil');
  for (const x of [1, 3, 5, 9, 11, 21]) add('fence', x, 22);
  return plan;
}
export const BLUEPRINT = makeBlueprint();
export const samePlacement = (a: Placement, b: Placement) => a.kind === b.kind && a.x === b.x && a.z === b.z && a.y === b.y && a.rotation === b.rotation;
export function nextHint(pieces: Piece[]) { return BLUEPRINT.find(p => !pieces.some(q => samePlacement(p, q)) && !placementError(pieces, p)); }
export function starter(settings: Settings): Piece[] {
  if (settings.template === 'empty') return [];
  return BLUEPRINT.slice(0, 27).map((p, i) => ({ ...p, id: i + 1 }));
}
export function tasks(pieces: Piece[]) {
  const count = (kind: Kind) => pieces.filter(p => p.kind === kind).length;
  return [
    { name: '一块块垒起砖墙', hint: '放置 80 块整砖或半砖', value: Math.min(80, count('brick') + count('half')), target: 80 },
    { name: '留好门洞与窗洞', hint: '安装至少 1 扇门框和 1 扇窗框', value: Math.min(1, count('door')) + Math.min(1, count('window')), target: 2 },
    { name: '把屋瓦一片片铺好', hint: '铺 16 片斜瓦和 4 片屋脊瓦', value: Math.min(16, count('tile')) + Math.min(4, count('ridge')), target: 20 },
    { name: '砌菜畦，再填土', hint: '用砖围好两处菜畦，分别填入泥土', value: Math.min(2, count('soil')), target: 2 },
    { name: '砌池岸，再安内胆', hint: '用砖围好四边，放入鱼池内胆', value: Math.min(1, count('water')), target: 1 },
  ];
}
export const complete = (pieces: Piece[]) => tasks(pieces).every(t => t.value === t.target);
