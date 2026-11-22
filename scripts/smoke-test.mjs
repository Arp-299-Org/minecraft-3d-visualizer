import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fileUrl = `file://${path.join(rootDir, 'index.html')}`;
const distIndexPath = path.join(rootDir, 'dist', 'index.html');

const distHtml = await readFile(distIndexPath, 'utf8');
if (/https?:\/\/(cdn\.|fonts\.googleapis|unpkg\.com|cdnjs\.)/i.test(distHtml)) {
    throw new Error('Unexpected external CDN reference in built dist/index.html.');
}

const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    const externalRequests = [];

    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (req) => {
        const u = req.url();
        if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) {
            externalRequests.push(u);
        }
    });

    await page.goto(fileUrl, { waitUntil: 'load' });
    await page.waitForTimeout(450);

    const canvasCount = await page.locator('canvas').count();
    if (canvasCount < 1) throw new Error('Expected a rendered 3D canvas.');

    if (await page.locator('#brand-corner').isHidden()) {
        throw new Error('Expected #brand-corner to be visible.');
    }

    // World mode test
    await page.fill('#mk-to-x', '12');
    await page.locator('#mk-to-x').dispatchEvent('input');
    const worldShape = await page.locator('#shapeLabel').textContent();
    if (worldShape !== 'Line') throw new Error(`Expected "Line", got "${worldShape}".`);
    const worldPreview = await page.locator('#codePreview').textContent();
    if (!worldPreview?.includes('world(12, -60, 0)')) {
        throw new Error(`Expected world(12, -60, 0) in preview; got "${worldPreview}".`);
    }

    // Relative (~) mode test including negative value
    await page.locator('#modeRelative').click();
    if (!(await page.locator('#groundRow').isHidden())) {
        throw new Error('Expected #groundRow to hide in ~ mode.');
    }
    const relPrefix = await page.locator('#mk-from-x-prefix').textContent();
    if (relPrefix !== '~') throw new Error(`Expected "~" prefix; got "${relPrefix}".`);
    await page.fill('#mk-from-x', '-5');
    await page.locator('#mk-from-x').dispatchEvent('input');
    const relPreview = await page.locator('#codePreview').textContent();
    if (!relPreview?.includes('pos(-5, 0, 0)')) {
        throw new Error(`Expected pos(-5, 0, 0) in preview; got "${relPreview}".`);
    }

    // Facing (^) mode + plain-English labels + East rotation test
    await page.locator('#modeLocal').click();
    if (await page.locator('#facingRow').isHidden()) {
        throw new Error('Expected #facingRow to be visible in ^ mode.');
    }
    const localPrefix = await page.locator('#mk-from-x-prefix').textContent();
    const colXTitle = await page.locator('#col-x-title').textContent();
    const colZTitle = await page.locator('#col-z-title').textContent();
    if (localPrefix !== '^') throw new Error(`Expected "^" prefix; got "${localPrefix}".`);
    if (colXTitle !== 'Left/Right') throw new Error(`Expected "Left/Right"; got "${colXTitle}".`);
    if (colZTitle !== 'Fwd/Back') throw new Error(`Expected "Fwd/Back"; got "${colZTitle}".`);

    const sceneLabels = await page.locator('.label').allTextContents();
    if (!sceneLabels.includes('Forward (+)') || !sceneLabels.includes('Left (+)')) {
        throw new Error(`Expected Forward (+) and Left (+) 3D labels; got ${JSON.stringify(sceneLabels)}`);
    }
    if (sceneLabels.some((t) => /\^\d/.test(t))) {
        throw new Error(`Unexpected ^1/^2/^3 text in 3D labels: ${JSON.stringify(sceneLabels)}`);
    }

    const keyText = await page.locator('#coordKey').textContent();
    if (/\^\d/.test(keyText || '')) {
        throw new Error(`Unexpected ^1/^2/^3 text inside #coordKey: ${keyText}`);
    }

    await page.locator('[data-facing="E"]').click();
    const readout = await page.locator('#facingReadout').textContent();
    if (!readout?.includes('East')) throw new Error(`Expected "East" in #facingReadout; got "${readout}".`);

    // Preset tests
    await page.locator('#presetLocal').click();
    const localPresetShape = await page.locator('#shapeLabel').textContent();
    const localPresetCode = await page.locator('#codePreview').textContent();
    if (localPresetShape !== 'Box (3D)') throw new Error(`Expected Box (3D) for In Front preset; got "${localPresetShape}".`);
    if (!localPresetCode?.includes('posLocal(-4, 0, 4), posLocal(4, 6, 10)')) {
        throw new Error(`Unexpected In Front preset code: "${localPresetCode}".`);
    }

    await page.locator('#presetWall').click();
    const wallPresetShape = await page.locator('#shapeLabel').textContent();
    const wallPresetCode = await page.locator('#codePreview').textContent();
    if (wallPresetShape !== 'Wall') throw new Error(`Expected Wall for Wall preset; got "${wallPresetShape}".`);
    if (!wallPresetCode?.includes('world(0, -60, 0), world(14, -52, 0)')) {
        throw new Error(`Unexpected Wall preset code: "${wallPresetCode}".`);
    }

    // ? Key toggle open & close
    if (!(await page.locator('#coordKey').isHidden())) {
        throw new Error('Expected #coordKey to start hidden.');
    }
    await page.locator('#keyToggle').click();
    if (await page.locator('#coordKey').isHidden()) {
        throw new Error('Expected #coordKey to become visible after clicking ? Key.');
    }
    await page.locator('#keyToggle').click();
    if (!(await page.locator('#coordKey').isHidden())) {
        throw new Error('Expected #coordKey to close after clicking ? Key again.');
    }

    if (externalRequests.length > 0) {
        throw new Error(`External requests detected:\n${externalRequests.join('\n')}`);
    }
    if (errors.length > 0) {
        throw new Error(`Browser errors found:\n${errors.join('\n')}`);
    }
} finally {
    await browser.close();
}
