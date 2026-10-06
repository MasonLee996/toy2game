import * as T from 'three';
import { CELL, HEIGHT, PARTS, type Kind } from './rules';

export class Models {
  private geometries = new Map<string, T.BufferGeometry>();
  private materials = new Map<string, T.MeshStandardMaterial>();
  private geometry(key: string, create: () => T.BufferGeometry) {
    if (!this.geometries.has(key)) this.geometries.set(key, create());
    return this.geometries.get(key)!;
  }
  material(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, new T.MeshStandardMaterial({ color, roughness: 0.82 }));
    return this.materials.get(color)!;
  }
  box(g: T.Object3D, size: number[], at: number[], color: string) {
    const mesh = new T.Mesh(this.geometry(`box:${size}`, () => new T.BoxGeometry(...size as [number, number, number])), this.material(color));
    mesh.position.set(...at as [number, number, number]); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
  }
  sphere(g: T.Object3D, size: number[], at: number[], color: string) {
    const mesh = new T.Mesh(this.geometry('sphere', () => new T.SphereGeometry(1, 10, 8)), this.material(color));
    mesh.scale.set(...size as [number, number, number]); mesh.position.set(...at as [number, number, number]); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
  }
  cylinder(g: T.Object3D, r: number, height: number, at: number[], color: string) {
    const mesh = new T.Mesh(this.geometry(`cylinder:${r}:${height}`, () => new T.CylinderGeometry(r, r, height, 8)), this.material(color));
    mesh.position.set(...at as [number, number, number]); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
  }
  part(kind: Kind) {
    const g = new T.Group(), p = PARTS[kind], w = p.w * CELL, d = p.d * CELL, h = p.h * HEIGHT;
    if (kind === 'brick' || kind === 'half' || kind === 'lintel') {
      this.box(g, [w - 0.025, h - 0.027, d - 0.025], [0, h / 2 + 0.006, 0], kind === 'half' ? '#bf714b' : kind === 'lintel' ? '#b5805a' : '#c97b50');
      this.box(g, [w - 0.018, 0.021, d - 0.018], [0, 0.011, 0], '#dcd1b8');
      // Shallow fired-clay pores and edge marks distinguish loose bricks from wall panels.
      for (const x of [-w * 0.25, w * 0.25]) {
        const pore = this.cylinder(g, 0.039, 0.004, [x, h - 0.006, 0], '#925a3e');
        pore.castShadow = false;
      }
      for (let i = 0; i < 3; i++) this.box(g, [0.016, 0.025, 0.003], [(i - 1) * w * 0.26, h * (0.3 + i * 0.16), d / 2 - 0.011], '#ab653f');
    }
    if (kind === 'door' || kind === 'window') {
      const white = '#f3ead6';
      for (const x of [-w / 2 + 0.055, w / 2 - 0.055]) this.box(g, [0.1, h, 0.15], [x, h / 2, 0], white);
      this.box(g, [w, 0.1, 0.18], [0, h - 0.05, 0], white);
      this.box(g, [w, 0.075, 0.19], [0, 0.04, 0], white);
      if (kind === 'window') {
        this.box(g, [0.055, h - 0.1, 0.07], [0, h / 2, 0.035], white);
        this.box(g, [w - 0.1, 0.05, 0.07], [0, h * 0.53, 0.035], white);
      } else {
        const arch = new T.Mesh(this.geometry('arch', () => new T.TorusGeometry(w * 0.39, 0.045, 6, 16, Math.PI)), this.material(white));
        arch.position.set(0, h * 0.64, 0.07); g.add(arch);
      }
    }
    if (kind === 'tile') {
      const panel = new T.Group(), length = Math.hypot(w, h);
      panel.rotation.z = Math.atan2(h, w); panel.position.y = h / 2; g.add(panel);
      this.box(panel, [length + 0.045, 0.065, d + 0.025], [0, 0, 0], '#59605a');
      for (let z = -d / 2 + 0.08; z < d / 2; z += 0.17) this.box(panel, [length + 0.05, 0.035, 0.028], [0, 0.05, z], '#7c8075');
    }
    if (kind === 'ridge') {
      const ridge = this.cylinder(g, 0.16, d + 0.04, [0, 0.065, 0], '#8d9185'); ridge.rotation.x = Math.PI / 2;
      for (const x of [-0.25, 0.25]) { const wing = this.box(g, [0.46, 0.06, d + 0.025], [x, 0.04, 0], '#6b756b'); wing.rotation.z = x > 0 ? -0.28 : 0.28; }
    }
    if (kind === 'fence') {
      for (let x = -0.4; x <= 0.45; x += 0.2) {
        this.box(g, [0.09, 0.5, 0.09], [x, 0.26, 0], '#f5f0dc');
        const cap = this.box(g, [0.064, 0.064, 0.09], [x, 0.52, 0], '#f5f0dc'); cap.rotation.z = Math.PI / 4;
      }
      for (const y of [0.13, 0.38]) this.box(g, [0.98, 0.06, 0.055], [0, y, -0.06], '#e1e3cf');
    }
    if (kind === 'soil') {
      this.box(g, [w - 0.035, 0.15, d - 0.035], [0, 0.075, 0], '#76533b');
      for (const x of [-0.22, 0.22]) for (const z of [-0.22, 0.22]) {
        this.cylinder(g, 0.02, 0.27, [x, 0.27, z], '#4e763d'); this.sphere(g, [0.095, 0.095, 0.095], [x, 0.2, z], '#c77178');
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5;
          const leaf = this.sphere(g, [0.055, 0.18, 0.045], [x + Math.sin(a) * 0.06, 0.36, z + Math.cos(a) * 0.06], ['#60843e', '#809b4f', '#4f7a39'][i % 3]);
          leaf.rotation.set(Math.cos(a) * 0.65, 0, -Math.sin(a) * 0.65);
        }
      }
    }
    if (kind === 'water') {
      this.box(g, [w - 0.025, 0.1, d - 0.025], [0, 0.07, 0], '#578f90');
      this.box(g, [w - 0.045, 0.035, d - 0.045], [0, 0.21, 0], '#9ccbcc');
      for (const z of [-d / 2 + 0.018, d / 2 - 0.018]) this.box(g, [w, 0.24, 0.025], [0, 0.12, z], '#c5d9d2');
      for (const x of [-w / 2 + 0.018, w / 2 - 0.018]) this.box(g, [0.025, 0.24, d], [x, 0.12, 0], '#c5d9d2');
      for (let i = 0; i < 3; i++) {
        const fish = new T.Group(); fish.userData.fish = i;
        this.sphere(fish, [0.13, 0.025, 0.05], [0, 0, 0], i % 2 ? '#f4e4bf' : '#d8834e');
        const tail = this.box(fish, [0.065, 0.016, 0.08], [-0.14, 0, 0], '#d89760'); tail.rotation.y = Math.PI / 4;
        fish.position.set((i - 1) * 0.38, 0.235, (i % 2 - 0.5) * 0.38); g.add(fish);
      }
    }
    return g;
  }
  tool(erase: boolean) {
    const g = new T.Group();
    if (erase) {
      this.box(g, [0.12, 0.76, 0.12], [0, 0.42, 0], '#b87843');
      this.box(g, [0.57, 0.24, 0.25], [0, 0.84, 0], '#626c70');
      this.box(g, [0.12, 0.28, 0.29], [-0.25, 0.84, 0], '#d19267');
      g.rotation.z = -0.5;
    } else {
      const shape = new T.Shape(); shape.moveTo(-0.28, -0.23); shape.lineTo(0.28, -0.23); shape.lineTo(0, 0.44); shape.closePath();
      const blade = new T.Mesh(this.geometry('trowel', () => new T.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false })), this.material('#b6c4c4'));
      blade.rotation.x = -Math.PI / 2; g.add(blade);
      this.box(g, [0.055, 0.18, 0.055], [0, 0.1, -0.11], '#7a8b8f');
      this.box(g, [0.13, 0.13, 0.42], [0, 0.23, -0.06], '#b87542');
    }
    g.traverse(child => { if (child instanceof T.Mesh) child.castShadow = true; });
    return g;
  }
  board() {
    const g = new T.Group();
    this.box(g, [12.4, 0.33, 12.4], [0, -0.23, 0], '#c3ab85');
    this.box(g, [12.25, 0.1, 12.25], [0, -0.025, 0], '#b8c28a');
    for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) this.box(g, [0.984, 0.024, 0.984], [x - 5.5, 0.033, z - 5.5], ['#b1bd83', '#b4c089', '#b7c38d', '#bac58c'][(x * 7 + z * 3) % 4]);
    for (let i = 0; i < 12; i++) for (const side of [-1, 1]) {
      this.box(g, [0.97, 0.21, 0.18], [i - 5.5, -0.095, side * 6.15], '#c48e5c');
      this.box(g, [0.18, 0.21, 0.97], [side * 6.15, -0.095, i - 5.5], '#c48e5c');
    }
    return g;
  }
  dispose() { this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); }
}

export function makeThumbnails(renderer: T.WebGLRenderer, models: Models): Record<Kind, string> {
  const scene = new T.Scene(); scene.background = new T.Color('#edece1');
  scene.add(new T.HemisphereLight('#ffffff', '#abb291', 2.2));
  const light = new T.DirectionalLight('#fff8e6', 3); light.position.set(-3, 6, 4); scene.add(light);
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 40); camera.position.set(4, 3.2, 5);
  const result = {} as Record<Kind, string>;
  renderer.setSize(200, 142); renderer.setPixelRatio(1);
  for (const kind of Object.keys(PARTS) as Kind[]) {
    const object = models.part(kind); scene.add(object);
    const bounds = new T.Box3().setFromObject(object), center = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3());
    const span = Math.max(size.x, size.y, size.z) * 0.88;
    camera.left = -span * 1.4; camera.right = span * 1.4; camera.top = span; camera.bottom = -span;
    camera.position.copy(center).add(new T.Vector3(4, 3.2, 5)); camera.lookAt(center); camera.updateProjectionMatrix();
    renderer.render(scene, camera); result[kind] = renderer.domElement.toDataURL('image/png'); scene.remove(object);
  }
  return result;
}
