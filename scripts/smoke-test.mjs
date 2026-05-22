import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fileUrl = `file://${path.join(rootDir, 'index.html')}`;

const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];

    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(fileUrl, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const canvasCount = await page.locator('canvas').count();
    if (canvasCount < 1) throw new Error('Expected a rendered 3D canvas.');

    await page.fill('#mk-to-x', '12');
    await page.locator('#mk-to-x').dispatchEvent('input');

    const shape = await page.locator('#shapeLabel').textContent();
    if (shape !== 'Line') throw new Error(`Expected shape label to update to "Line"; got "${shape}".`);

    if (errors.length > 0) {
        throw new Error(`Browser errors found:\n${errors.join('\n')}`);
    }
} finally {
    await browser.close();
}
