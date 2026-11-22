import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

let scene, camera, renderer, labelRenderer, controls;
let fillGroup, playerGroup, facingGroup;
let fwdArrow, leftArrow, fwdLabel, leftLabel;
let compassLabels = [];
let modeRadios, groundInput, groundRow, relativeHintRow, facingRow, facingReadout;
let keyToggleBtn, coordKeyEl, codePreviewEl, copyCodeBtn;
let colHeads = {};
let facingButtons = [];

let currentMode = 'world';
let currentFacing = 'N';
let groundValue = -60;
let shapeLabel, shapeDesc, shapeIndicator;
let makeCodeFields = {};
let makeCodeModeLabels = {};

const WORLD_MIN = 0;
const WORLD_MAX = 63;
const OFFSET_MIN = -31;
const OFFSET_MAX = 31;
const SCENE_RANGE = 20;
const SCALE_FACTOR = SCENE_RANGE / WORLD_MAX;
const GROUND_MIN = -64;
const GROUND_MAX = 320;
const MAX_PIXEL_RATIO = 2;

const FACING_INFO = {
    N: 'North (-Z)',
    E: 'East (+X)',
    S: 'South (+Z)',
    W: 'West (-X)',
};

const sliders = {};
let hasWebGL = true;

/** Convert MakeCode posLocal(left, up, forward) into Minecraft world offsets (X East, Y Up, Z South). */
export function localToWorld(left, up, forward, facing) {
    if (facing === 'E') return { x: forward, y: up, z: -left };
    if (facing === 'S') return { x: left, y: up, z: forward };
    if (facing === 'W') return { x: -forward, y: up, z: left };
    return { x: -left, y: up, z: -forward };
}

function activeBounds() {
    if (currentMode === 'world') return { min: WORLD_MIN, max: WORLD_MAX };
    return { min: OFFSET_MIN, max: OFFSET_MAX };
}

function clampAxisValue(value) {
    const { min, max } = activeBounds();
    return Math.max(min, Math.min(max, Math.round(value)));
}

function setupDragNumbers() {
    document.querySelectorAll('.drag-num').forEach((input) => {
        let dragging = false;
        let moved = false;
        let startY;
        let startVal;

        input.addEventListener('mousedown', (e) => {
            if (document.activeElement === input) return;
            e.preventDefault();
            dragging = true;
            moved = false;
            startY = e.clientY;
            startVal = parseFloat(input.value) || 0;
            input.classList.add('dragging');
            document.body.style.cursor = 'ns-resize';

            const onMove = (moveEvent) => {
                if (!dragging) return;
                const dy = startY - moveEvent.clientY;
                if (Math.abs(dy) >= 2) moved = true;
                const delta = Math.round(dy * 0.5);
                applyDragValue(input, startVal + delta);
            };

            const onUp = () => {
                dragging = false;
                input.classList.remove('dragging');
                document.body.style.cursor = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (!moved) input.focus();
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        input.addEventListener('touchstart', (e) => {
            if (document.activeElement === input) return;
            const touch = e.touches[0];
            dragging = true;
            startY = touch.clientY;
            startVal = parseFloat(input.value) || 0;
            input.classList.add('dragging');

            const onMove = (moveEvent) => {
                if (!dragging) return;
                moveEvent.preventDefault();
                const dy = startY - moveEvent.touches[0].clientY;
                const delta = Math.round(dy * 0.5);
                applyDragValue(input, startVal + delta);
            };

            const onEnd = () => {
                dragging = false;
                input.classList.remove('dragging');
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
            };

            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        });

        input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const isY = input.dataset.isY === 'true';
            const resetVal = input.dataset.ground === 'true'
                ? -60
                : (isY && currentMode === 'world' ? getGroundLevel() : 0);
            input._userEditing = false;
            applyDragValue(input, resetVal);
            input.blur();
        });

        input.addEventListener('focus', () => {
            input._userEditing = true;
            input.select();
        });

        input.addEventListener('blur', () => {
            input._userEditing = false;
            const parsed = parseFloat(input.value);
            if (!Number.isNaN(parsed)) applyDragValue(input, parsed);
            syncAll();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });

        input.addEventListener('input', () => {
            const raw = input.value.trim();
            if (raw === '' || raw === '-' || raw === '+') return;
            const parsed = parseFloat(raw);
            if (!Number.isNaN(parsed)) applyDragValue(input, parsed, true);
        });
    });
}

function applyDragValue(input, newVal, skipDisplayUpdate) {
    if (input.dataset.ground === 'true') {
        const clamped = Math.min(GROUND_MAX, Math.max(GROUND_MIN, Math.round(newVal)));
        groundValue = clamped;
        if (!skipDisplayUpdate && !input._userEditing) input.value = clamped;
        syncAll();
        return;
    }

    const sliderId = input.dataset.slider;
    const isY = input.dataset.isY === 'true';
    const slider = sliders[sliderId];
    if (!slider) return;

    const rawOffset = isY && currentMode === 'world' ? newVal - getGroundLevel() : newVal;
    const clamped = clampAxisValue(rawOffset);
    slider.value = clamped;

    if (!skipDisplayUpdate && !input._userEditing) {
        if (isY && currentMode === 'world') {
            input.value = Math.round((clamped + getGroundLevel()) * 100) / 100;
        } else {
            input.value = clamped;
        }
    }

    syncAll();
}

function setMode(nextMode) {
    if (nextMode !== 'world' && nextMode !== 'relative' && nextMode !== 'local') return;
    currentMode = nextMode;
    const { min, max } = activeBounds();

    const radioMap = { world: 'modeWorld', relative: 'modeRelative', local: 'modeLocal' };
    const activeRadio = document.getElementById(radioMap[nextMode]);
    if (activeRadio) activeRadio.checked = true;

    Object.values(sliders).forEach((slider) => {
        if (!slider) return;
        slider.min = String(min);
        slider.max = String(max);
        const cur = parseFloat(slider.value) || 0;
        slider.value = String(Math.max(min, Math.min(max, Math.round(cur))));
    });

    if (colHeads.x) {
        if (currentMode === 'local') {
            colHeads.x.title.textContent = 'Left/Right';
            colHeads.x.sub.textContent = 'R- L+';
            colHeads.y.title.textContent = 'Up/Down';
            colHeads.y.sub.textContent = 'Dn- Up+';
            colHeads.z.title.textContent = 'Fwd/Back';
            colHeads.z.sub.textContent = 'Bk- Fwd+';
        } else {
            colHeads.x.title.textContent = 'X';
            colHeads.x.sub.textContent = 'W- E+';
            colHeads.y.title.textContent = 'Y';
            colHeads.y.sub.textContent = 'Dn- Up+';
            colHeads.z.title.textContent = 'Z';
            colHeads.z.sub.textContent = 'N- S+';
        }
    }

    if (groundRow) groundRow.classList.toggle('hidden', currentMode !== 'world');
    if (relativeHintRow) relativeHintRow.classList.toggle('hidden', currentMode !== 'relative');
    if (facingRow) facingRow.classList.toggle('hidden', currentMode !== 'local');

    syncAll();
}

function setFacing(nextFacing) {
    if (!FACING_INFO[nextFacing]) return;
    currentFacing = nextFacing;
    facingButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.facing === nextFacing);
    });
    if (facingReadout) facingReadout.textContent = FACING_INFO[nextFacing];
    syncAll();
}

function setSliderValues(vals) {
    Object.entries(vals).forEach(([key, val]) => {
        if (sliders[key]) sliders[key].value = String(val);
    });
}

function applyPreset(name) {
    document.querySelectorAll('.drag-num').forEach((inp) => {
        inp._userEditing = false;
    });

    if (name === 'wall') {
        setMode('world');
        setSliderValues({ x1: 0, y1: 0, z1: 0, x2: 14, y2: 8, z2: 0 });
    } else if (name === 'room') {
        setMode('world');
        setSliderValues({ x1: 0, y1: 0, z1: 0, x2: 10, y2: 6, z2: 8 });
    } else if (name === 'local') {
        setMode('local');
        setFacing('E');
        setSliderValues({ x1: -4, y1: 0, z1: 4, x2: 4, y2: 6, z2: 10 });
    }
    syncAll();
}

function syncAll() {
    updatePlayerAndFacing();
    updateFillBox();
    updateCommandPreview();
    if (hasWebGL && renderer && labelRenderer && scene && camera) {
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
    }
}

function init() {
    try {
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x171b33, 0.011);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(10, 20, -32);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0';
        labelRenderer.domElement.style.pointerEvents = 'none';
        document.body.appendChild(labelRenderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(5, 5, 3);
        const cameraVector = new THREE.Vector3().subVectors(camera.position, controls.target);
        const initialPolarAngle = Math.atan2(
            Math.sqrt(cameraVector.x * cameraVector.x + cameraVector.z * cameraVector.z),
            cameraVector.y,
        );
        controls.minPolarAngle = initialPolarAngle;
        controls.maxPolarAngle = initialPolarAngle;
        controls.enablePan = false;
        controls.update();
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        scene.add(new THREE.AmbientLight(0xffffff, 0.75));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7.5);
        scene.add(directionalLight);

        drawAxes();
        scene.add(new THREE.GridHelper(40, 40, 0x5b63a8, 0x343966));
        createPlayerMarker();
    } catch (error) {
        console.warn('WebGL not available:', error.message);
        hasWebGL = false;
        showWebGLFallback();
    }

    groundInput = document.getElementById('groundLevel');
    groundRow = document.getElementById('groundRow');
    relativeHintRow = document.getElementById('relativeHintRow');
    facingRow = document.getElementById('facingRow');
    facingReadout = document.getElementById('facingReadout');
    facingButtons = Array.from(document.querySelectorAll('.face-btn'));
    modeRadios = document.querySelectorAll('input[name="mode"]');
    keyToggleBtn = document.getElementById('keyToggle');
    coordKeyEl = document.getElementById('coordKey');
    codePreviewEl = document.getElementById('codePreview');
    copyCodeBtn = document.getElementById('copyCodeBtn');

    shapeLabel = document.getElementById('shapeLabel');
    shapeDesc = document.getElementById('shapeDesc');
    shapeIndicator = document.getElementById('shapeIndicator');

    colHeads = {
        x: { title: document.getElementById('col-x-title'), sub: document.getElementById('col-x-sub') },
        y: { title: document.getElementById('col-y-title'), sub: document.getElementById('col-y-sub') },
        z: { title: document.getElementById('col-z-title'), sub: document.getElementById('col-z-sub') },
    };

    makeCodeFields = {
        from: {
            x: { value: document.getElementById('mk-from-x'), prefix: document.getElementById('mk-from-x-prefix') },
            y: { value: document.getElementById('mk-from-y'), prefix: document.getElementById('mk-from-y-prefix') },
            z: { value: document.getElementById('mk-from-z'), prefix: document.getElementById('mk-from-z-prefix') },
        },
        to: {
            x: { value: document.getElementById('mk-to-x'), prefix: document.getElementById('mk-to-x-prefix') },
            y: { value: document.getElementById('mk-to-y'), prefix: document.getElementById('mk-to-y-prefix') },
            z: { value: document.getElementById('mk-to-z'), prefix: document.getElementById('mk-to-z-prefix') },
        },
    };
    makeCodeModeLabels = {
        from: document.getElementById('mk-from-mode'),
        to: document.getElementById('mk-to-mode'),
    };

    ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'].forEach((id) => {
        sliders[id] = document.getElementById(id);
    });

    const commitGround = () => {
        if (!groundInput) return;
        const clamped = clampGroundValue(groundInput.value);
        if (clamped === null) {
            groundInput.value = groundValue.toString();
        } else {
            groundValue = clamped;
            groundInput.value = clamped.toString();
        }
        syncAll();
    };

    if (groundInput) {
        groundInput.addEventListener('input', () => {
            const value = groundInput.value.trim();
            if (value === '' || value === '-' || value === '+') return;
            const parsed = parseFloat(value);
            if (Number.isNaN(parsed)) return;
            groundValue = Math.min(GROUND_MAX, Math.max(GROUND_MIN, Math.round(parsed)));
            syncAll();
        });
        groundInput.addEventListener('blur', commitGround);
        groundInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                commitGround();
                groundInput.blur();
            }
        });
    }

    if (modeRadios) {
        modeRadios.forEach((radio) => {
            radio.addEventListener('change', () => setMode(radio.value));
        });
    }

    facingButtons.forEach((btn) => {
        btn.addEventListener('click', () => setFacing(btn.dataset.facing));
    });

    const presetWall = document.getElementById('presetWall');
    const presetRoom = document.getElementById('presetRoom');
    const presetLocal = document.getElementById('presetLocal');
    if (presetWall) presetWall.addEventListener('click', () => applyPreset('wall'));
    if (presetRoom) presetRoom.addEventListener('click', () => applyPreset('room'));
    if (presetLocal) presetLocal.addEventListener('click', () => applyPreset('local'));

    if (keyToggleBtn && coordKeyEl) {
        keyToggleBtn.addEventListener('click', () => {
            const isHidden = coordKeyEl.classList.toggle('hidden');
            keyToggleBtn.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
        });
    }

    if (copyCodeBtn && codePreviewEl) {
        copyCodeBtn.addEventListener('click', async () => {
            const text = codePreviewEl.textContent || '';
            let ok = false;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    ok = true;
                }
            } catch {}
            if (!ok) {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                try {
                    ok = document.execCommand('copy');
                } catch {}
                ta.remove();
            }
            copyCodeBtn.textContent = ok ? 'Copied' : 'Copy';
            setTimeout(() => {
                copyCodeBtn.textContent = 'Copy';
            }, 1200);
        });
    }

    setupDragNumbers();
    setMode('world');
    animate();
}

function createPlayerMarker() {
    playerGroup = new THREE.Group();

    const baseRing = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.62, 24),
        new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide }),
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.04;
    playerGroup.add(baseRing);

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.72, 0.28),
        new THREE.MeshPhongMaterial({ color: 0x38bdf8 }),
    );
    body.position.y = 0.42;
    playerGroup.add(body);

    const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.36, 0.36),
        new THREE.MeshPhongMaterial({ color: 0xfde68a }),
    );
    head.position.y = 0.98;
    playerGroup.add(head);

    facingGroup = new THREE.Group();
    fwdArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 0.28, 0),
        4.4,
        0x60a5fa,
        0.85,
        0.5,
    );
    leftArrow = new THREE.ArrowHelper(
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 0.28, 0),
        3.2,
        0xf87171,
        0.65,
        0.4,
    );
    facingGroup.add(fwdArrow, leftArrow);

    const fwdEl = document.createElement('div');
    fwdEl.className = 'label label-local-fwd';
    fwdEl.textContent = 'Forward (+)';
    fwdLabel = new CSS2DObject(fwdEl);

    const leftEl = document.createElement('div');
    leftEl.className = 'label label-local-left';
    leftEl.textContent = 'Left (+)';
    leftLabel = new CSS2DObject(leftEl);

    facingGroup.add(fwdLabel, leftLabel);
    playerGroup.add(facingGroup);
    scene.add(playerGroup);
}

function updatePlayerAndFacing() {
    if (!hasWebGL || !playerGroup) return;
    const showPlayer = currentMode === 'relative' || currentMode === 'local';
    const showFacing = currentMode === 'local';

    playerGroup.visible = showPlayer;
    facingGroup.visible = showFacing;
    fwdLabel.element.classList.toggle('hidden', !showFacing);
    leftLabel.element.classList.toggle('hidden', !showFacing);

    compassLabels.forEach((lbl) => {
        lbl.element.classList.toggle('label-world-dim', showFacing);
    });

    if (!showFacing) return;

    const fwd = localToWorld(0, 0, 1, currentFacing);
    const left = localToWorld(1, 0, 0, currentFacing);
    const fwdVec = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
    const leftVec = new THREE.Vector3(left.x, 0, left.z).normalize();

    fwdArrow.setDirection(fwdVec);
    leftArrow.setDirection(leftVec);

    fwdLabel.position.set(fwdVec.x * 5.2, 0.75, fwdVec.z * 5.2);
    leftLabel.position.set(leftVec.x * 3.8, 0.75, leftVec.z * 3.8);
}

function drawAxes() {
    const len = 20.5;
    compassLabels = [];
    const makeLabel = (text, colorClass, isCompass) => {
        const div = document.createElement('div');
        div.className = `label ${colorClass}`;
        div.textContent = text;
        const obj = new CSS2DObject(div);
        if (isCompass) compassLabels.push(obj);
        return obj;
    };
    const line = (points, color) => {
        scene.add(
            new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(points),
                new THREE.LineBasicMaterial({ color, linewidth: 3 }),
            ),
        );
    };

    line([new THREE.Vector3(-len, 0, 0), new THREE.Vector3(len, 0, 0)], 0xff8a8a);
    let label = makeLabel('+X East', 'text-red-400', true);
    label.position.set(len, -1.5, 0);
    scene.add(label);
    label = makeLabel('-X West', 'text-red-400', true);
    label.position.set(-len, 0, 0);
    scene.add(label);

    line([new THREE.Vector3(0, -len, 0), new THREE.Vector3(0, len, 0)], 0x5cff99);
    label = makeLabel('+Y Up', 'text-green-400', false);
    label.position.set(0, len, 0);
    scene.add(label);
    label = makeLabel('-Y Down', 'text-green-400', false);
    label.position.set(0, -len, 0);
    scene.add(label);

    line([new THREE.Vector3(0, 0, -len), new THREE.Vector3(0, 0, len)], 0x79b8ff);
    label = makeLabel('+Z South', 'text-blue-400', true);
    label.position.set(0, 2, len);
    scene.add(label);
    label = makeLabel('-Z North', 'text-blue-400', true);
    label.position.set(0, 0, -len);
    scene.add(label);
}

function showWebGLFallback() {
    const fallback = document.createElement('div');
    fallback.id = 'webgl-fallback';
    fallback.className = 'label';
    fallback.textContent = '3D view unavailable';
    fallback.style.position = 'fixed';
    fallback.style.left = '1rem';
    fallback.style.top = '5rem';
    fallback.style.zIndex = '2';
    fallback.style.background = 'rgba(0, 0, 0, 0.78)';
    document.body.appendChild(fallback);
}

function getCoordinates() {
    const getValue = (id) => {
        const slider = sliders[id];
        return slider ? parseFloat(slider.value) || 0 : 0;
    };

    return {
        x1: getValue('x1'),
        y1: getValue('y1'),
        z1: getValue('z1'),
        x2: getValue('x2'),
        y2: getValue('y2'),
        z2: getValue('z2'),
    };
}

function getGroundLevel() {
    return groundValue;
}

function clampGroundValue(raw) {
    const trimmed = (raw ?? '').toString().trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '+') return null;
    const parsed = parseFloat(trimmed);
    if (Number.isNaN(parsed)) return null;
    return Math.min(GROUND_MAX, Math.max(GROUND_MIN, Math.round(parsed)));
}

function updateCommandPreview() {
    const coordinates = getCoordinates();
    const ground = currentMode === 'world' ? getGroundLevel() : 0;
    updateMakeCodeValues(coordinates, ground);
    updateShapeIndicator(coordinates);
    updateCodePreview(coordinates, ground);
}

function updateMakeCodeValues(coords, ground) {
    if (!makeCodeFields.from) return;
    const format = (value) => Math.round(value * 100) / 100;
    const prefix = currentMode === 'relative' ? '~' : currentMode === 'local' ? '^' : '';
    const from = { x: coords.x1, y: coords.y1, z: coords.z1 };
    const to = { x: coords.x2, y: coords.y2, z: coords.z2 };

    if (currentMode === 'world') {
        from.y += ground;
        to.y += ground;
    }

    const modeText = currentMode === 'world' ? 'world' : '';
    if (makeCodeModeLabels.from) makeCodeModeLabels.from.textContent = modeText;
    if (makeCodeModeLabels.to) makeCodeModeLabels.to.textContent = modeText;

    const setValue = (group, axis, value) => {
        const field = makeCodeFields[group]?.[axis];
        if (!field) return;
        if (field.value && !field.value._userEditing) field.value.value = format(value);
        if (field.prefix) field.prefix.textContent = prefix;
    };

    setValue('from', 'x', from.x);
    setValue('from', 'y', from.y);
    setValue('from', 'z', from.z);
    setValue('to', 'x', to.x);
    setValue('to', 'y', to.y);
    setValue('to', 'z', to.z);
}

function updateCodePreview(coords, ground) {
    if (!codePreviewEl) return;
    const fn = currentMode === 'world' ? 'world' : currentMode === 'local' ? 'posLocal' : 'pos';
    const y1 = currentMode === 'world' ? coords.y1 + ground : coords.y1;
    const y2 = currentMode === 'world' ? coords.y2 + ground : coords.y2;
    codePreviewEl.textContent = `blocks.fill(GRASS, ${fn}(${coords.x1}, ${y1}, ${coords.z1}), ${fn}(${coords.x2}, ${y2}, ${coords.z2}))`;
}

function updateShapeIndicator(coords) {
    if (!shapeLabel) return;
    const dx = Math.abs(coords.x2 - coords.x1);
    const dy = Math.abs(coords.y2 - coords.y1);
    const dz = Math.abs(coords.z2 - coords.z1);
    const dimensions = [dx, dy, dz].filter((value) => value > 0).length;

    let name;
    let description;
    let borderColor;

    if (dimensions === 0) {
        name = 'Single Block';
        description = 'From and To are the same spot';
        borderColor = '#555';
    } else if (dimensions === 1) {
        const axis = currentMode === 'local'
            ? (dx > 0 ? 'Left/Right' : dy > 0 ? 'Up/Down' : 'Forward/Back')
            : (dx > 0 ? 'X' : dy > 0 ? 'Y' : 'Z');
        name = 'Line';
        description = `A row of blocks along ${axis}`;
        borderColor = '#a78bfa';
    } else if (dimensions === 2) {
        if (dy === 0) {
            name = 'Floor / Ceiling';
            description = 'Flat on the ground - no height';
        } else {
            name = 'Wall';
            description = 'Flat - like a wall with no thickness';
        }
        borderColor = '#fbbf24';
    } else {
        name = 'Box (3D)';
        description = 'Has width, height, and depth';
        borderColor = '#34d399';
    }

    shapeLabel.textContent = name;
    shapeDesc.textContent = description;
    shapeIndicator.style.borderColor = borderColor;
}

function updateFillBox() {
    if (!hasWebGL) return;
    if (fillGroup) {
        fillGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(fillGroup);
    }

    const coords = getCoordinates();
    let p1 = { x: coords.x1, y: coords.y1, z: coords.z1 };
    let p2 = { x: coords.x2, y: coords.y2, z: coords.z2 };

    if (currentMode === 'local') {
        p1 = localToWorld(coords.x1, coords.y1, coords.z1, currentFacing);
        p2 = localToWorld(coords.x2, coords.y2, coords.z2, currentFacing);
    }

    const width = (Math.abs(p2.x - p1.x) + 1) * SCALE_FACTOR;
    const height = (Math.abs(p2.y - p1.y) + 1) * SCALE_FACTOR;
    const depth = (Math.abs(p2.z - p1.z) + 1) * SCALE_FACTOR;
    const centerX = ((p1.x + p2.x) / 2) * SCALE_FACTOR;
    const centerY = ((p1.y + p2.y) / 2) * SCALE_FACTOR;
    const centerZ = ((p1.z + p2.z) / 2) * SCALE_FACTOR;

    fillGroup = new THREE.Group();
    const boxGeometry = new THREE.BoxGeometry(width, height, depth);
    const fillMesh = new THREE.Mesh(
        boxGeometry,
        new THREE.MeshPhongMaterial({
            color: 0x4b7a47,
            transparent: true,
            opacity: 0.34,
            side: THREE.DoubleSide,
            depthWrite: false,
        }),
    );
    fillMesh.position.set(centerX, centerY, centerZ);

    const edgeLines = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeometry),
        new THREE.LineBasicMaterial({ color: 0x7ddf7a, linewidth: 2 }),
    );
    edgeLines.position.set(centerX, centerY, centerZ);
    fillGroup.add(fillMesh, edgeLines);

    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    if (minY > 0 || maxY < 0) {
        const boxBottomY = centerY - height / 2;
        const boxTopY = centerY + height / 2;
        const anchorY = minY > 0 ? boxBottomY : boxTopY;
        const minX = centerX - width / 2;
        const maxX = centerX + width / 2;
        const minZ = centerZ - depth / 2;
        const maxZ = centerZ + depth / 2;

        const footprintGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(minX, 0.03, minZ),
            new THREE.Vector3(maxX, 0.03, minZ),
            new THREE.Vector3(maxX, 0.03, maxZ),
            new THREE.Vector3(minX, 0.03, maxZ),
            new THREE.Vector3(minX, 0.03, minZ),
        ]);
        fillGroup.add(
            new THREE.Line(
                footprintGeo,
                new THREE.LineBasicMaterial({ color: 0x7ddf7a, transparent: true, opacity: 0.48 }),
            ),
        );

        const guidePoints = [
            new THREE.Vector3(minX, anchorY, minZ), new THREE.Vector3(minX, 0.03, minZ),
            new THREE.Vector3(maxX, anchorY, minZ), new THREE.Vector3(maxX, 0.03, minZ),
            new THREE.Vector3(maxX, anchorY, maxZ), new THREE.Vector3(maxX, 0.03, maxZ),
            new THREE.Vector3(minX, anchorY, maxZ), new THREE.Vector3(minX, 0.03, maxZ),
        ];
        fillGroup.add(
            new THREE.LineSegments(
                new THREE.BufferGeometry().setFromPoints(guidePoints),
                new THREE.LineBasicMaterial({ color: 0x7ddf7a, transparent: true, opacity: 0.28 }),
            ),
        );
    }

    scene.add(fillGroup);
}

function animate() {
    if (!hasWebGL) return;
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    if (!hasWebGL) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

init();
