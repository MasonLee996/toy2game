import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';
const engine = process.env.CHECK_ENGINE ?? 'chrome';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['ipad-landscape', 1180, 820], ['ipad-portrait', 820, 1180], ['phone', 390, 844], ['phone-landscape', 844, 390]]) {
    const context = await browser.newContext({ baseURL: process.env.GAME_URL ?? 'http://localhost:5173/games/garden-builder/', viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('./'); await expect(page.locator('#loading')).toHaveCount(0);
    const actions = page.locator('#preview-actions'), count = n => expect(page.locator('#piece-count')).toHaveText(String(n));
    await expect(actions).toBeVisible();
    await page.getByRole('button', { name: '取消预览', exact: true }).click();
    await expect(actions).toBeHidden(); await expect(page.locator('#place')).toBeDisabled(); await count(27);
    await page.getByRole('button', { name: '选择整块红砖', exact: true }).click();
    await page.locator('#coordinates').click(); await page.locator('#column').selectOption({ value: '16' }); await page.locator('#row').selectOption({ value: '16' });
    await page.getByRole('button', { name: '选中这个位置' }).click();
    await page.getByRole('button', { name: '确认放置', exact: true }).click(); await count(28);
    await expect(actions).toBeVisible();
    await page.getByRole('button', { name: '确认放置', exact: true }).click(); await count(29);
    await expect(actions).toBeVisible();
    await page.locator('#garden-scene').scrollIntoViewIfNeeded();
    const sceneBox = await page.locator('#garden-scene').boundingBox(), buttons = await actions.locator('button').all();
    for (const button of buttons) {
      const box = await button.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.ok(box.x >= sceneBox.x && box.x + box.width <= sceneBox.x + sceneBox.width && box.y >= sceneBox.y && box.y + box.height <= sceneBox.y + sceneBox.height);
    }
    await page.screenshot({ path: `artifacts/garden-builder/${engine}-${name}-confirm.png`, fullPage: true });
    await page.locator('#erase-mode').click();
    const selectTop = async () => {
      const point = await page.evaluate(() => {
        const { scene, game } = window.__garden, p = game.pieces.at(-1), box = scene.renderer.domElement.getBoundingClientRect();
        const v = scene.camera.position.clone().set((p.x - 12 + (p.rotation % 2 ? 0.5 : 1)) * 0.5, (p.y + 0.9) * 0.3 + 0.055, (p.z - 12 + (p.rotation % 2 ? 1 : 0.5)) * 0.5).project(scene.camera);
        return { x: box.x + (v.x + 1) * box.width / 2, y: box.y + (1 - v.y) * box.height / 2 };
      });
      await page.touchscreen.tap(point.x, point.y);
    };
    await page.locator('#garden-scene').scrollIntoViewIfNeeded(); await selectTop();
    await expect(page.getByRole('button', { name: '确认拆除', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '取消预览', exact: true }).click(); await count(29); await expect(actions).toBeHidden();
    await selectTop(); await page.getByRole('button', { name: '确认拆除', exact: true }).click(); await count(28);
    await expect(page.locator('#rotate-preview')).toBeHidden();
    await page.locator('#build-mode').click(); await page.locator('#rotate-preview').click();
    await expect(page.locator('#confirm-preview')).toBeDisabled(); await expect(page.locator('#place')).toBeDisabled();
    await page.locator('#rotate-preview').click();
    await expect(page.locator('#confirm-preview')).toBeEnabled();
    await page.getByRole('button', { name: '取消预览', exact: true }).click(); await count(28);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.deepEqual(errors, []);
    await context.close(); console.log(`PASS ${engine} ${name}: contextual confirm/cancel, stack, removal, invalid placement and 44px in-scene buttons`);
  }
} finally { await browser.close(); }
