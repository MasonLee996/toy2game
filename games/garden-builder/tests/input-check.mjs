import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const engine = process.env.CHECK_ENGINE ?? 'chrome';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
await mkdir('artifacts/garden-builder', { recursive: true });
try {
  const context = await browser.newContext({ baseURL: process.env.GAME_URL ?? 'http://localhost:5173/games/garden-builder/', viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('./'); await expect(page.locator('#loading')).toHaveCount(0);
  const canvas = page.locator('#garden-scene canvas');
  const count = n => expect(page.locator('#piece-count')).toHaveText(String(n));
  const idle = () => expect(page.locator('#garden-scene')).toHaveAttribute('aria-busy', 'false');
  const selected = () => page.evaluate(() => ({ ...window.__garden.selection }));
  const screen = (x, z, y = 0) => page.evaluate(({ x, z, y }) => {
    const scene = window.__garden.scene, box = scene.renderer.domElement.getBoundingClientRect();
    const point = scene.camera.position.clone().set((x - 12) * 0.5, y * 0.3 + 0.06, (z - 12) * 0.5).project(scene.camera);
    return { x: box.x + (point.x + 1) * box.width / 2, y: box.y + (1 - point.y) * box.height / 2 };
  }, { x, z, y });
  await expect(page.locator('#auto-mortar')).toBeChecked(); await expect(page.locator('#layer')).toHaveCount(0);
  await page.getByRole('button', { name: '俯视小院' }).click();
  await page.getByRole('button', { name: '选择整块红砖', exact: true }).click();
  await page.locator('#follow-plan').check();
  const ground = await screen(16.4, 16.4);
  await page.mouse.click(ground.x, ground.y);
  await expect(page.locator('#follow-plan')).not.toBeChecked();
  assert.equal((await selected()).y, 0, 'Ground clicks leave the blueprint layer');
  await page.getByRole('button', { name: '选择整块红砖', exact: true }).click();
  await page.mouse.dblclick(ground.x, ground.y, { delay: 80 });
  await expect(page.locator('#garden-scene')).toHaveAttribute('aria-busy', 'true'); await count(27);
  await page.waitForFunction(() => window.__garden.scene.animationProgress > 0.2);
  await page.evaluate(() => window.__garden.scene.setPaused(true));
  await page.screenshot({ path: `artifacts/garden-builder/${engine}-mortar.png`, fullPage: true });
  await page.getByRole('button', { name: '暂停游戏' }).click();
  const frozen = await page.evaluate(() => window.__garden.scene.animationProgress);
  await page.waitForTimeout(850); await count(27);
  assert.equal(await page.evaluate(() => window.__garden.scene.animationProgress), frozen, 'Pause freezes mortar animation');
  await page.getByRole('button', { name: '继续搭建', exact: true }).click(); await count(28); await idle();
  const placed = await page.evaluate(() => window.__garden.game.pieces.at(-1));
  assert.deepEqual([placed.x, placed.z, placed.y], [16, 16, 0]);
  await page.screenshot({ path: `artifacts/garden-builder/${engine}-free-build.png`, fullPage: true });
  // Two real touchscreen taps on the same brick automatically stack exactly one brick.
  const top = await screen(17, 16.5, 1);
  await page.touchscreen.tap(top.x, top.y); await page.touchscreen.tap(top.x, top.y);
  await count(29); await idle();
  assert.equal(await page.evaluate(() => window.__garden.game.pieces.at(-1).y), 1);
  const off = await screen(6.4, 18.4);
  await page.mouse.click(off.x, off.y); assert.equal((await selected()).y, 0, 'Return from tall stack to ground automatically');
  await page.mouse.dblclick(off.x, off.y, { delay: 60 });
  await expect(page.locator('#garden-scene')).toHaveAttribute('aria-busy', 'true');
  // Hidden pages and dialogs cannot advance the pending placement.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: '游戏设置' }).click(); await page.getByRole('button', { name: '关闭设置' }).click();
  await page.waitForTimeout(800); await count(29);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await count(30); await idle();
  // Build and demolition have distinct visible tools, and double-tap removal is undoable.
  await page.getByRole('button', { name: '拆除模式' }).click();
  await expect(page.locator('#tool-indicator')).toContainText('拆除锤'); await expect(page.locator('#garden-scene')).toHaveAttribute('data-tool', 'demolish');
  const last = await page.evaluate(() => window.__garden.game.pieces.at(-1));
  const removable = await screen(last.x + (last.rotation % 2 ? 0.5 : 1), last.z + (last.rotation % 2 ? 1 : 0.5), last.y + 1); await page.mouse.click(removable.x, removable.y);
  await page.screenshot({ path: `artifacts/garden-builder/${engine}-demolition.png`, fullPage: true });
  await page.mouse.dblclick(removable.x, removable.y, { delay: 60 }); await count(29);
  await page.getByRole('button', { name: '撤销一步' }).click(); await count(30);
  await page.getByRole('button', { name: '搭建模式' }).click(); await expect(page.locator('#tool-indicator')).toContainText('泥刀');
  // Camera gestures and canceled pointers never commit a placement.
  const initial = await selected();
  await page.mouse.move(ground.x, ground.y); await page.mouse.down(); await page.mouse.move(ground.x + 100, ground.y + 25, { steps: 6 }); await page.mouse.up();
  assert.deepEqual(await selected(), initial); await count(30);
  if (engine === 'chrome') {
    const client = await context.newCDPSession(page), touch = (id, x, y) => ({ id, x, y, radiusX: 8, radiusY: 8, force: 1 });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(0, ground.x - 45, ground.y), touch(1, ground.x + 45, ground.y)] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(0, ground.x - 85, ground.y), touch(1, ground.x + 85, ground.y)] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual(await selected(), initial); await count(30);
  }
  await canvas.evaluate(node => node.addEventListener('pointerdown', e => { window.__testPointer = { pointerId: e.pointerId, pointerType: e.pointerType }; }, { once: true }));
  await page.mouse.move(ground.x, ground.y); await page.mouse.down();
  await canvas.dispatchEvent('pointercancel', await page.evaluate(() => window.__testPointer));
  await page.mouse.up();
  assert.deepEqual(await selected(), initial); await count(30);
  await page.getByRole('button', { name: '下一块图纸提示', exact: true }).click();
  await page.locator('#auto-mortar').uncheck(); await page.locator('#place').click(); await idle(); await count(30);
  await expect(page.locator('#place')).toHaveText('放到这里');
  await page.keyboard.press('r'); await expect(page.locator('#place')).toHaveText('抹一层砂浆');
  await page.keyboard.press('r'); await page.locator('#place').click(); await idle(); await page.locator('#place').click(); await count(31);
  await page.keyboard.press('ControlOrMeta+z'); await count(30); await page.keyboard.press('ControlOrMeta+Shift+z'); await count(31);
  // A confirmed new game cancels the old animation and its eventual commit.
  await page.locator('#auto-mortar').check(); await page.locator('#hint').click(); await page.locator('#place').click();
  await page.locator('#settings').click(); await page.locator('input[value="empty"]').check();
  await page.getByRole('button', { name: '按此设置开始新局', exact: false }).click(); await page.waitForTimeout(850); await count(0); await idle();
  const bounds = await page.locator('#place').boundingBox(); assert.ok(bounds.y + bounds.height <= 820);
  await page.reload(); await count(0); await expect(page.locator('#auto-mortar')).toBeChecked();
  assert.deepEqual(errors, []); await context.close();
  // In an angled camera, the elevated translucent brick must be the click target,
  // rather than its projection onto a different ground cell.
  const ghostContext = await browser.newContext({ baseURL: process.env.GAME_URL ?? 'http://localhost:5173/games/garden-builder/', viewport: { width: 1180, height: 820 }, hasTouch: true, reducedMotion: 'reduce' });
  const ghostPage = await ghostContext.newPage(); await ghostPage.goto('./');
  await ghostPage.getByRole('button', { name: '选择整块红砖', exact: true }).click();
  await ghostPage.locator('#coordinates').click(); await ghostPage.locator('#column').selectOption('16'); await ghostPage.locator('#row').selectOption('16');
  await ghostPage.getByRole('button', { name: '选中这个位置' }).click();
  for (let i = 0; i < 4; i++) { await ghostPage.locator('#place').click(); await expect(ghostPage.locator('#piece-count')).toHaveText(String(28 + i)); }
  const expected = await ghostPage.evaluate(() => ({ ...window.__garden.selection })); assert.equal(expected.y, 4);
  const ghostPoint = await ghostPage.evaluate(() => {
    const { scene, selection: p } = window.__garden, box = scene.renderer.domElement.getBoundingClientRect();
    const v = scene.camera.position.clone().set((p.x - 12 + (p.rotation % 2 ? 0.5 : 1)) * 0.5, (p.y + 0.9) * 0.3 + 0.055, (p.z - 12 + (p.rotation % 2 ? 1 : 0.5)) * 0.5).project(scene.camera);
    return { x: box.x + (v.x + 1) * box.width / 2, y: box.y + (1 - v.y) * box.height / 2 };
  });
  await ghostPage.screenshot({ path: `artifacts/garden-builder/${engine}-transparent-target.png`, fullPage: true });
  if (engine === 'webkit') { await ghostPage.touchscreen.tap(ghostPoint.x, ghostPoint.y); await ghostPage.touchscreen.tap(ghostPoint.x, ghostPoint.y); }
  else await ghostPage.mouse.dblclick(ghostPoint.x, ghostPoint.y, { delay: 60 });
  await expect(ghostPage.locator('#piece-count')).toHaveText('32');
  const actual = await ghostPage.evaluate(() => { const { id, ...p } = window.__garden.game.pieces.at(-1); return p; });
  assert.deepEqual(actual, expected, 'Double-click must place exactly where the transparent preview was shown');
  await ghostPage.locator('#erase-mode').click(); await ghostPage.mouse.click(ghostPoint.x, ghostPoint.y);
  await expect(ghostPage.locator('#place')).toBeEnabled();
  await ghostPage.screenshot({ path: `artifacts/garden-builder/${engine}-highlight-target.png`, fullPage: true });
  await ghostPage.mouse.dblclick(ghostPoint.x, ghostPoint.y, { delay: 60 }); await expect(ghostPage.locator('#piece-count')).toHaveText('31');
  await ghostContext.close();
  const blocked = await browser.newContext({ baseURL: process.env.GAME_URL ?? 'http://localhost:5173/games/garden-builder/' });
  await blocked.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('unavailable'); }; });
  const p = await blocked.newPage(); await p.goto('./'); await p.locator('#place').click();
  await expect(p.locator('#piece-count')).toHaveText('28'); await expect(p.locator('#save-state')).toContainText('存储不可用'); await blocked.close();
  console.log(`PASS ${engine}: free ground/stack placement, double-click/touch, tool distinction, mortar pause/cancel, gestures, history and storage`);
} finally { await browser.close(); }
