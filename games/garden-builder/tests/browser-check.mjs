import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, expect } from '@playwright/test';
import { PNG } from 'pngjs';
const baseURL = process.env.GAME_URL ?? 'http://localhost:5173/games/garden-builder/';
const artifacts = fileURLToPath(new URL('../../../artifacts/garden-builder/', import.meta.url));
await mkdir(artifacts, { recursive: true });
async function position(page, x, z, y = 0) {
  await page.getByRole('button', { name: '精确定位', exact: true }).click();
  await page.getByRole('combobox', { name: '放置列' }).selectOption({ value: String(x) });
  await page.getByRole('combobox', { name: '放置行' }).selectOption({ value: String(z) });
  await page.getByRole('button', { name: '选中这个位置' }).click();
}
for (const engine of process.env.CHECK_ENGINE ? [process.env.CHECK_ENGINE] : process.env.CHECK_WEBKIT ? ['chrome', 'webkit'] : ['chrome']) {
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
  let finishedSave;
  try {
    for (const [name, width, height] of [['desktop', 1440, 1000], ['ipad-landscape', 1180, 820], ['ipad-portrait', 820, 1180], ['phone', 390, 844], ['phone-landscape', 844, 390]]) {
      const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [], failed = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (r.status() >= 400) failed.push(r.url()); });
      await page.goto('./'); await expect(page.locator('#garden-scene canvas')).toBeVisible();
      const canvas = page.locator('#garden-scene canvas'), before = await canvas.screenshot();
      await expect(page.locator('#auto-mortar')).toBeChecked(); await expect(page.locator('#layer')).toHaveCount(0);
      await page.getByRole('button', { name: '放到这里', exact: true }).click(); await expect(page.locator('#piece-count')).toHaveText('28');
      const after = await canvas.screenshot(); assert.notEqual(Buffer.compare(before, after), 0);
      const pixels = PNG.sync.read(after), colors = new Set();
      for (let i = 0; i < pixels.data.length; i += 80) colors.add(`${pixels.data[i] >> 3},${pixels.data[i + 1] >> 3},${pixels.data[i + 2] >> 3}`);
      assert.ok(colors.size > 120, 'Scene must have actual model pixels');
      await page.getByRole('button', { name: '撤销一步' }).click(); await expect(page.locator('#piece-count')).toHaveText('27');
      await page.getByRole('button', { name: '重做一步' }).click(); await expect(page.locator('#piece-count')).toHaveText('28');
      await page.reload(); await expect(page.locator('#piece-count')).toHaveText('28');
      await page.getByRole('button', { name: '暂停游戏' }).click(); await expect(page.locator('#pause-overlay')).toBeVisible();
      await expect(page.locator('#place')).toBeDisabled(); await expect(page.locator('#follow-plan')).toBeDisabled(); await page.getByRole('button', { name: '继续搭建', exact: true }).click();
      await page.getByRole('button', { name: '游戏设置' }).click(); await page.locator('input[value="empty"]').check();
      await page.screenshot({ path: `${artifacts}${engine}-${name}-settings.png`, fullPage: true });
      await page.getByRole('button', { name: '关闭设置' }).click(); await expect(page.locator('#piece-count')).toHaveText('28');
      await page.getByRole('button', { name: '新的一局' }).click(); await page.getByRole('button', { name: '继续这局' }).click(); await expect(page.locator('#piece-count')).toHaveText('28');
      if (!finishedSave) {
        await page.locator('#auto-mortar').check(); await page.locator('#follow-plan').check();
        for (let i = 0; i < 200 && !await page.locator('#place').isDisabled(); i++) { await page.locator('#place').click(); await expect(page.locator('#garden-scene')).toHaveAttribute('aria-busy', 'false'); }
        await expect(page.locator('#piece-count')).toHaveText('172');
        finishedSave = await page.evaluate(() => localStorage.getItem('garden-builder-save-v2'));
      } else {
        // Reuse the full build made through visible controls above; exercise real save restoration on each viewport.
        await page.evaluate(value => localStorage.setItem('garden-builder-save-v2', value), finishedSave); await page.reload();
      }
      await expect(page.locator('#task-count')).toHaveText('5 / 5');
      await page.getByRole('button', { name: '拆除模式' }).click(); await position(page, 3, 3, 0);
      await expect(page.locator('#tool-indicator')).toContainText('拆除锤');
      await page.getByRole('button', { name: '完成作品', exact: false }).click(); await expect(page.getByRole('dialog', { name: '小院落成，生活开场。' })).toBeVisible();
      await page.screenshot({ path: `${artifacts}${engine}-${name}-result.png`, fullPage: true });
      await page.getByRole('button', { name: '再欣赏一会儿', exact: false }).click();
      await page.getByRole('button', { name: '显示或隐藏网格' }).click(); await page.getByRole('button', { name: '恢复默认视角' }).click();
      await page.screenshot({ path: `${artifacts}${engine}-${name}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const targets = await page.locator('.header button:visible, .view-tools button').evaluateAll(nodes => nodes.map(node => ({ label: node.ariaLabel, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
      for (const target of targets) assert.ok(target.width >= 43.5 && target.height >= 43.5, `${target.label} needs 44px`);
      await page.getByRole('button', { name: '新的一局' }).click(); await expect(page.locator('dialog[open]')).toHaveCount(0); await expect(page.locator('#piece-count')).toHaveText('27');
      await page.getByRole('button', { name: '游戏设置' }).click(); await page.locator('input[value="empty"]').check();
      await page.getByRole('button', { name: '按此设置开始新局', exact: false }).click(); await expect(page.locator('#piece-count')).toHaveText('0');
      await page.reload(); await expect(page.locator('#piece-count')).toHaveText('0');
      await page.getByRole('button', { name: '放到这里', exact: true }).click(); await expect(page.locator('#piece-count')).toHaveText('1');
      await page.getByRole('button', { name: '新的一局' }).click(); await page.getByRole('button', { name: '重新开局' }).click(); await expect(page.locator('#piece-count')).toHaveText('0');
      assert.deepEqual(errors, []); assert.deepEqual(failed, []); await context.close(); console.log(`PASS ${engine} ${name}: mortar, single bricks, goals, history, persistence, pause, settings, restart, pixels and layout`);
    }
    const context = await browser.newContext({ baseURL }); await context.addInitScript(() => localStorage.setItem('garden-builder-save-v2', '{invalid'));
    const page = await context.newPage(); await page.goto('./'); await expect(page.locator('#piece-count')).toHaveText('27'); await context.close(); console.log(`PASS ${engine}: corrupted save recovery`);
  } finally { await browser.close(); }
}
