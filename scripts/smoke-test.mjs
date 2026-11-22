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

    // Facing (^) mode + East rotation test
    await page.locator('#modeLocal').click();
    if (await page.locator('#facingRow').isHidden()) {
        throw new Error('Expected #facingRow to be visible in ^ mode.');
    }
    const localPrefix = await page.locator('#mk-from-x-prefix').textContent();
    const colXSub = await page.locator('#col-x-sub').textContent();
    const colZSub = await page.locator('#col-z-sub').textContent();
    if (localPrefix !== '^') throw new Error(`Expected "^" prefix; got "${localPrefix}".`);
    if (colXSub !== 'R- L+') throw new Error(`Expected "R- L+"; got "${colXSub}".`);
    if (colZSub !== 'Bk- Fwd+') throw new Error(`Expected "Bk- Fwd+"; got "${colZSub}".`);
    const localPreview = await page.locator('#codePreview').textContent();
    if (!localPreview?.includes('posLocal(')) {
        throw new Error(`Expected posLocal( in preview; got "${localPreview}".`);
    }

    await page.locator('[data-facing="E"]').click();
    const readout = await page.locator('#facingReadout').textContent();
    if (!readout?.includes('East')) throw new Error(`Expected "East" in #facingReadout; got "${readout}".`);
    const eastActive = await page.locator('[data-facing="E"]').evaluate((el) => el.classList.contains('active'));
    if (!eastActive) throw new Error('Expected East facing button to have .active class.');

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
