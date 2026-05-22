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
    await testWebGLView();
    await testFallbackView();
} finally {
    await browser.close();
}

async function testWebGLView() {
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

    await page.close();
}

async function testFallbackView() {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];

    await page.addInitScript(() => {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
            if (typeof type === 'string' && type.toLowerCase().includes('webgl')) return null;
            return originalGetContext.call(this, type, ...args);
        };
    });

    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        const text = message.text();
        if (message.type() === 'error' && !text.includes('WebGL')) errors.push(text);
    });

    await page.goto(fileUrl, { waitUntil: 'load' });
    await page.waitForSelector('#fallback-canvas');

    const fallbackLabel = await page.locator('#webgl-fallback').textContent();
    if (fallbackLabel !== '2D view') throw new Error(`Expected 2D fallback label; got "${fallbackLabel}".`);

    const fallbackBox = await page.locator('#fallback-canvas').boundingBox();
    if (!fallbackBox || fallbackBox.width < 100 || fallbackBox.height < 100) {
        throw new Error('Expected the fallback graph canvas to fill the page.');
    }

    await page.fill('#mk-to-x', '12');
    await page.locator('#mk-to-x').dispatchEvent('input');

    const shape = await page.locator('#shapeLabel').textContent();
    if (shape !== 'Line') throw new Error(`Expected fallback shape label to update to "Line"; got "${shape}".`);

    if (errors.length > 0) {
        throw new Error(`Fallback browser errors found:\n${errors.join('\n')}`);
    }

    await page.close();
}
