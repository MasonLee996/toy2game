import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Models, makeThumbnails } from './models';
import { HEIGHT, CELL, PARTS, SIZE, dimensions, type Kind, type Piece, type Placement } from './rules';

type Callbacks = { select: (x: number, z: number, id?: number) => void; place: () => void; error: () => void };
export class GardenScene {
  readonly renderer: T.WebGLRenderer;
  readonly camera = new T.OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
  readonly world = new T.Scene();
  readonly thumbnails: Record<Kind, string>;
  private models = new Models();
  private actors = new T.Group();
  private ghost = new T.Group();
  private ghostMaterial = new T.MeshStandardMaterial({ color: '#86b997', transparent: true, opacity: 0.48, depthWrite: false });
  private marker: T.Mesh;
  private grid = new T.GridHelper(SIZE * CELL, SIZE, '#7b8863', '#93a074');
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private abort = new AbortController();
  private frameId = 0;
  private last = 0;
  private time = 0;
  private fishes: T.Object3D[] = [];
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private ray = new T.Raycaster();
  private pointer: { id: number; x: number; y: number; moved: boolean } | null = null;
  private pointers = new Set<number>();
  private multiple = false;
  private disposed = false;
  private pieces: Piece[] = [];
  private selection: Placement | null = null;
  private tool = new T.Group();
  private mortar = new T.Group();
  private lastTap: { x: number; y: number; at: number; type: string } | null = null;
  private job: { elapsed: number; duration: number; p: Placement; finish: () => void; layBrick: boolean; smear: T.Mesh } | null = null;
  get animationProgress() { return this.job ? this.job.elapsed / this.job.duration : null; }
  paused = false;
  erase = false;
  constructor(private host: HTMLElement, private callbacks: Callbacks, private actions: HTMLElement) {
    this.renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.22;
    this.thumbnails = makeThumbnails(this.renderer, this.models);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.world.background = new T.Color('#e9ecdf');
    this.world.add(new T.HemisphereLight('#fffcf1', '#b8c3a5', 2));
    const sun = new T.DirectionalLight('#fff0d2', 3); sun.position.set(-6, 12, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536); Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.1, far: 40 });
    sun.shadow.normalBias = 0.045; sun.shadow.bias = -0.0002; this.world.add(sun);
    this.models.box(this.world, [200, 0.1, 200], [0, -0.53, 0], '#e9ecdf');
    this.world.add(this.models.board(), this.actors, this.ghost, this.grid, this.tool, this.mortar); this.grid.position.y = 0.06;
    const markerMaterial = new T.MeshBasicMaterial({ color: '#fff7cf', transparent: true, opacity: 0.6, depthWrite: false });
    this.marker = new T.Mesh(new T.BoxGeometry(1, 0.045, 1), markerMaterial); this.world.add(this.marker);
    const canvas = this.renderer.domElement; canvas.setAttribute('aria-label', '小院建造家三维搭建场地'); canvas.setAttribute('role', 'img'); this.host.append(canvas);
    canvas.addEventListener('pointerdown', this.down, { signal: this.abort.signal });
    canvas.addEventListener('pointermove', this.move, { signal: this.abort.signal });
    canvas.addEventListener('pointerup', this.up, { signal: this.abort.signal });
    canvas.addEventListener('pointercancel', this.cancel, { signal: this.abort.signal });
    canvas.addEventListener('lostpointercapture', this.cancel, { signal: this.abort.signal });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.setPaused(true); callbacks.error(); }, { signal: this.abort.signal });
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = false; this.controls.enablePan = true;
    this.controls.minPolarAngle = 0.05; this.controls.maxPolarAngle = Math.PI / 2.8;
    this.controls.minZoom = 0.65; this.controls.maxZoom = 2.4;
    this.controls.touches.ONE = T.TOUCH.ROTATE; this.controls.touches.TWO = T.TOUCH.DOLLY_PAN;
    this.resetView();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
    this.frameId = requestAnimationFrame(this.frame);
  }
  sync(pieces: Piece[]) {
    this.pieces = pieces; this.actors.clear(); this.fishes = [];
    for (const p of pieces) {
      const object = this.models.part(p.kind), size = dimensions(p);
      object.position.set((p.x - SIZE / 2 + size.w / 2) * CELL, p.y * HEIGHT + 0.055, (p.z - SIZE / 2 + size.d / 2) * CELL);
      object.rotation.y = p.rotation * Math.PI / 2;
      object.traverse(child => { child.userData.piece = p.id; if (child.userData.fish !== undefined) this.fishes.push(child); }); this.actors.add(object);
    }
  }
  preview(p: Placement, valid: boolean, erase: boolean, occupied = false, mortar = false) {
    if (this.erase !== erase || this.selection?.kind !== p.kind || this.selection?.rotation !== p.rotation) this.lastTap = null;
    this.selection = { ...p }; this.erase = erase;
    if (this.job) return;
    this.marker.visible = true; this.tool.visible = true;
    this.host.dataset.tool = erase ? 'demolish' : 'build';
    this.tool.clear(); this.tool.add(this.models.tool(erase));
    this.tool.position.set((p.x - SIZE / 2 + 0.5) * CELL, p.y * HEIGHT + (erase ? 0.25 : 0.55), (p.z - SIZE / 2) * CELL - 0.35);
    this.ghost.clear(); const size = dimensions(p);
    this.marker.position.set((p.x - SIZE / 2 + (erase ? 0.5 : size.w / 2)) * CELL, p.y * HEIGHT + 0.09, (p.z - SIZE / 2 + (erase ? 0.5 : size.d / 2)) * CELL);
    this.marker.scale.set((erase ? 1 : size.w) * CELL, 1, (erase ? 1 : size.d) * CELL);
    (this.marker.material as T.MeshBasicMaterial).color.set(erase ? '#dc8869' : valid ? '#eaf3c1' : '#de8a72');
    this.grid.position.y = 0.06;
    if (!occupied) {
      const object = this.models.part(p.kind); this.ghostMaterial.color.set(erase ? '#ec985b' : valid ? '#92b89a' : '#d48976');
      if (erase) object.scale.setScalar(1.025);
      object.traverse(child => { if (child instanceof T.Mesh) { child.material = this.ghostMaterial; child.castShadow = false; child.receiveShadow = false; } });
      object.position.set((p.x - SIZE / 2 + size.w / 2) * CELL, p.y * HEIGHT + 0.055, (p.z - SIZE / 2 + size.d / 2) * CELL); object.rotation.y = p.rotation * Math.PI / 2;
      this.ghost.add(object);
      if (!erase && mortar && PARTS[p.kind].mortar) {
        const smear = this.models.box(this.ghost, [size.w * CELL - 0.012, 0.025, size.d * CELL - 0.012], [object.position.x, object.position.y + 0.015, object.position.z], '#f1e4cd');
        smear.castShadow = false;
      }
    }
  }
  clearPreview() {
    this.selection = null; this.ghost.clear(); this.marker.visible = false; this.tool.visible = false;
    this.actions.hidden = true; this.lastTap = null;
  }
  private positionActions() {
    const p = this.selection;
    this.actions.hidden = !p || this.paused || !!this.job;
    if (!p || this.actions.hidden) return;
    const size = dimensions(p), point = new T.Vector3((p.x - SIZE / 2 + size.w / 2) * CELL, (p.y + size.h) * HEIGHT + 0.08, (p.z - SIZE / 2 + size.d / 2) * CELL).project(this.camera);
    if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || Math.abs(point.z) > 1) { this.actions.hidden = true; return; }
    const width = this.host.clientWidth, height = this.host.clientHeight;
    const x = T.MathUtils.clamp((point.x + 1) * width / 2 + 18, 8, width - this.actions.offsetWidth - 8);
    const y = T.MathUtils.clamp((1 - point.y) * height / 2 - 28, 8, height - 112);
    this.actions.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  animateMortar(p: Placement, layBrick: boolean, finish: () => void) {
    this.lastTap = null; this.pointer = null;
    const size = dimensions(p);
    const smear = this.models.box(this.mortar, [size.w * CELL - 0.012, 0.028, size.d * CELL - 0.012], [0, p.y * HEIGHT + 0.074, (p.z - SIZE / 2 + size.d / 2) * CELL], '#f1e4cd');
    this.job = { elapsed: 0, duration: this.reduced ? 0.08 : 0.72, p: { ...p }, finish, layBrick, smear };
    this.controls.enabled = false; this.updateMortar(0);
  }
  cancelAnimation() {
    this.job = null; this.mortar.clear(); this.ghost.position.y = 0; this.ghost.visible = true;
    this.controls.enabled = !this.paused; this.lastTap = null;
  }
  private updateMortar(dt: number) {
    const job = this.job; if (!job) return;
    job.elapsed += dt;
    const t = Math.min(1, job.elapsed / job.duration), spread = Math.min(1, t / 0.72), size = dimensions(job.p);
    const left = (job.p.x - SIZE / 2) * CELL, z = (job.p.z - SIZE / 2 + size.d / 2) * CELL;
    job.smear.scale.x = Math.max(0.01, spread); job.smear.position.x = left + size.w * CELL * spread / 2;
    this.tool.position.set(left + size.w * CELL * spread, job.p.y * HEIGHT + 0.13, z);
    this.ghost.visible = job.layBrick && t >= 0.72;
    this.ghost.position.y = this.reduced ? 0 : Math.max(0, 1 - (t - 0.72) / 0.28) * 0.45;
    if (t >= 1) { const finish = job.finish; this.cancelAnimation(); finish(); }
  }
  toggleGrid() { this.grid.visible = !this.grid.visible; return this.grid.visible; }
  setPaused(value: boolean) { this.paused = value; this.controls.enabled = !value && !this.job; this.pointer = null; this.pointers.clear(); this.lastTap = null; }
  resetView() { this.controls.target.set(0, 0.4, 0); this.camera.position.set(15, 14, 18); this.camera.zoom = 1; this.camera.updateProjectionMatrix(); this.controls.update(); }
  rotate() { const offset = this.camera.position.clone().sub(this.controls.target); offset.applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 4); this.camera.position.copy(this.controls.target).add(offset); this.controls.update(); }
  top() { this.camera.position.copy(this.controls.target).add(new T.Vector3(0, 25, 0.1)); this.controls.update(); }
  zoom(delta: number) { this.camera.zoom = T.MathUtils.clamp(this.camera.zoom + delta, 0.65, 2.4); this.camera.updateProjectionMatrix(); }
  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    const aspect = w / h, span = Math.max(7, 9 / aspect);
    this.camera.left = -span * aspect; this.camera.right = span * aspect; this.camera.top = span; this.camera.bottom = -span;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
  }
  private down = (e: PointerEvent) => {
    if (e.button !== 0 || this.paused || this.job) return;
    this.pointers.add(e.pointerId);
    if (this.pointers.size > 1) { this.multiple = true; this.pointer = null; this.lastTap = null; return; }
    this.multiple = false; this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };
  private move = (e: PointerEvent) => {
    if (this.pointer?.id === e.pointerId && Math.hypot(e.clientX - this.pointer.x, e.clientY - this.pointer.y) > 6) { this.pointer.moved = true; this.lastTap = null; }
  };
  private cancel = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.pointer = null; if (e.type === 'pointercancel') this.lastTap = null; };
  private tap(e: PointerEvent) {
    const previous = this.lastTap;
    const double = previous && e.timeStamp - previous.at < 360 && previous.type === e.pointerType && Math.hypot(e.clientX - previous.x, e.clientY - previous.y) < 18;
    this.lastTap = double ? null : { x: e.clientX, y: e.clientY, at: e.timeStamp, type: e.pointerType };
    if (double) this.callbacks.place();
  }
  private up = (e: PointerEvent) => {
    const pointer = this.pointer; this.pointers.delete(e.pointerId); this.pointer = null;
    if (this.paused || this.job || this.multiple || !pointer || pointer.id !== e.pointerId || pointer.moved) { this.lastTap = null; return; }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new T.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(this.actors, true)[0];
    const previewHit = this.ray.intersectObject(this.ghost, true)[0];
    // The visible preview is the confirmation target, especially at height:
    // projecting it back to the ground would move the brick away from its ghost.
    if (previewHit && (!hit || previewHit.distance <= hit.distance + 0.03)) { this.tap(e); return; }
    const piece = hit && this.pieces.find(p => p.id === hit.object.userData.piece);
    let x: number, z: number;
    if (piece && this.erase) { x = piece.x; z = piece.z; }
    else if (piece && this.selection) {
      const base = dimensions(piece), next = dimensions(this.selection);
      // Snap small targets to the brick footprint, so either half of a long brick
      // can be tapped to stack another brick without accidental overhangs.
      x = T.MathUtils.clamp(Math.floor(hit.point.x / CELL + SIZE / 2), piece.x, piece.x + Math.max(0, base.w - next.w));
      z = T.MathUtils.clamp(Math.floor(hit.point.z / CELL + SIZE / 2), piece.z, piece.z + Math.max(0, base.d - next.d));
    } else {
      const point = this.ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -0.055), new T.Vector3());
      if (!point) { this.lastTap = null; return; }
      x = Math.floor(point.x / CELL + SIZE / 2); z = Math.floor(point.z / CELL + SIZE / 2);
    }
    if (x < 0 || x >= SIZE || z < 0 || z >= SIZE) { this.lastTap = null; return; }
    this.callbacks.select(x, z, this.erase ? piece?.id : undefined);
    this.tap(e);
  };
  private frame = (at: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0, (at - this.last) / 1000)); this.last = at;
    if (!this.paused) this.updateMortar(dt);
    if (!this.paused && !this.reduced) {
      this.time += dt;
      for (const fish of this.fishes) {
        const t = this.time * 0.45 + Number(fish.userData.fish) * 2;
        fish.position.set(Math.cos(t) * 0.64, 0.235, Math.sin(t) * 0.27); fish.rotation.y = -t - Math.PI / 2;
      }
    }
    this.positionActions();
    if (!document.hidden) this.renderer.render(this.world, this.camera);
    this.frameId = requestAnimationFrame(this.frame);
  };
  dispose() {
    this.actions.hidden = true; this.cancelAnimation(); this.disposed = true; cancelAnimationFrame(this.frameId); this.abort.abort(); this.observer.disconnect(); this.controls.dispose();
    this.models.dispose(); this.ghostMaterial.dispose(); this.marker.geometry.dispose(); (this.marker.material as T.Material).dispose();
    this.grid.geometry.dispose(); (this.grid.material as T.Material).dispose();
    this.world.traverse(object => { if (object instanceof T.Light && 'shadow' in object) (object as T.DirectionalLight).shadow.dispose(); });
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
