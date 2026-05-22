import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

let scene, camera, renderer, labelRenderer, controls;
let fillGroup;
let modeRadios, groundInput, groundRow;
let currentMode = 'world';
let groundValue = -60;
let shapeLabel, shapeDesc, shapeIndicator;
let makeCodeFields = {};
let makeCodeModeLabels = {};

const SLIDER_MAX = 63;
const SCENE_RANGE = 20;
const SCALE_FACTOR = SCENE_RANGE / SLIDER_MAX;
const GROUND_MIN = -64;
const GROUND_MAX = 320;

const sliders = {};
let hasWebGL = true;

function setupDragNumbers() {
    document.querySelectorAll('.drag-num').forEach((input) => {
        let dragging = false;
        let startY;
        let startVal;

        input.addEventListener('mousedown', (e) => {
            if (document.activeElement === input) return;
            e.preventDefault();
            dragging = true;
            startY = e.clientY;
            startVal = parseFloat(input.value) || 0;
            input.classList.add('dragging');
            document.body.style.cursor = 'ns-resize';

            const onMove = (moveEvent) => {
                if (!dragging) return;
                const dy = startY - moveEvent.clientY;
                const delta = Math.round(dy * 0.5);
                applyDragValue(input, startVal + delta);
            };

            const onUp = () => {
                dragging = false;
                input.classList.remove('dragging');
                document.body.style.cursor = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
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
            const resetVal = isY && currentMode === 'world' ? getGroundLevel() : 0;
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
            const parsed = parseFloat(input.value.trim());
            if (!Number.isNaN(parsed)) applyDragValue(input, parsed, true);
        });
    });
}

function applyDragValue(input, newVal, skipDisplayUpdate) {
    if (input.dataset.ground === 'true') {
        const clamped = Math.min(GROUND_MAX, Math.max(GROUND_MIN, Math.round(newVal)));
        groundValue = clamped;
        if (!skipDisplayUpdate && !input._userEditing) input.value = clamped;
        updateFillBox();
        updateCommandPreview();
        return;
    }

    const sliderId = input.dataset.slider;
    const isY = input.dataset.isY === 'true';
    const slider = sliders[sliderId];
    if (!slider) return;

    let sliderVal;
    if (isY && currentMode === 'world') {
        sliderVal = newVal - getGroundLevel();
    } else {
        sliderVal = newVal;
    }

    sliderVal = Math.max(0, Math.min(SLIDER_MAX, Math.round(sliderVal)));
    slider.value = sliderVal;

    if (!skipDisplayUpdate && !input._userEditing) {
        if (isY && currentMode === 'world') {
            input.value = Math.round((sliderVal + getGroundLevel()) * 100) / 100;
        } else {
            input.value = sliderVal;
        }
    }

    updateFillBox();
    updateCommandPreview();
}

function syncAll() {
    updateFillBox();
    updateCommandPreview();
}

function init() {
    try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(10, 20, -32);

        renderer = new THREE.WebGLRenderer({ antialias: true });
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

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7.5);
        scene.add(directionalLight);

        drawAxes();
        scene.add(new THREE.GridHelper(40, 40, 0x333355, 0x222244));
    } catch (error) {
        console.warn('WebGL not available:', error.message);
        hasWebGL = false;
    }

    groundInput = document.getElementById('groundLevel');
    groundRow = document.getElementById('groundRow');
    modeRadios = document.querySelectorAll('input[name="mode"]');
    shapeLabel = document.getElementById('shapeLabel');
    shapeDesc = document.getElementById('shapeDesc');
    shapeIndicator = document.getElementById('shapeIndicator');

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
            const value = groundInput.value;
            if (value === '' || value === '-' || value === '+') {
                syncAll();
                return;
            }
            const parsed = parseFloat(value);
            if (Number.isNaN(parsed)) return;
            groundValue = Math.min(GROUND_MAX, Math.max(GROUND_MIN, parsed));
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
        modeRadios.forEach((radio) =>
            radio.addEventListener('change', () => {
                currentMode = radio.value;
                if (groundRow) groundRow.classList.toggle('hidden', currentMode !== 'world');
                syncAll();
            }),
        );
    }

    setupDragNumbers();
    syncAll();
    animate();
}

function drawAxes() {
    const len = 20.5;
    const makeLabel = (text, colorClass) => {
        const div = document.createElement('div');
        div.className = `label ${colorClass}`;
        div.textContent = text;
        return new CSS2DObject(div);
    };
    const line = (points, color) => {
        scene.add(
            new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(points),
                new THREE.LineBasicMaterial({ color, linewidth: 3 }),
            ),
        );
    };

    line([new THREE.Vector3(-len, 0, 0), new THREE.Vector3(len, 0, 0)], 0xf87171);
    let label = makeLabel('+X East', 'text-red-400');
    label.position.set(len, -1.5, 0);
    scene.add(label);
    label = makeLabel('-X West', 'text-red-400');
    label.position.set(-len, 0, 0);
    scene.add(label);

    line([new THREE.Vector3(0, -len, 0), new THREE.Vector3(0, len, 0)], 0x4ade80);
    label = makeLabel('+Y Up', 'text-green-400');
    label.position.set(0, len, 0);
    scene.add(label);
    label = makeLabel('-Y Down', 'text-green-400');
    label.position.set(0, -len, 0);
    scene.add(label);

    line([new THREE.Vector3(0, 0, -len), new THREE.Vector3(0, 0, len)], 0x60a5fa);
    label = makeLabel('+Z South', 'text-blue-400');
    label.position.set(0, 2, len);
    scene.add(label);
    label = makeLabel('-Z North', 'text-blue-400');
    label.position.set(0, 0, -len);
    scene.add(label);
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
}

function updateMakeCodeValues(coords, ground) {
    if (!makeCodeFields.from) return;
    const format = (value) => Math.round(value * 100) / 100;
    const prefix = currentMode === 'relative' ? '~' : '';
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
        const axis = dx > 0 ? 'X' : dy > 0 ? 'Y' : 'Z';
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
    const width = (Math.abs(coords.x2 - coords.x1) + 1) * SCALE_FACTOR;
    const height = (Math.abs(coords.y2 - coords.y1) + 1) * SCALE_FACTOR;
    const depth = (Math.abs(coords.z2 - coords.z1) + 1) * SCALE_FACTOR;
    const centerX = ((coords.x1 + coords.x2) / 2) * SCALE_FACTOR;
    const centerY = ((coords.y1 + coords.y2) / 2) * SCALE_FACTOR;
    const centerZ = ((coords.z1 + coords.z2) / 2) * SCALE_FACTOR;

    fillGroup = new THREE.Group();
    const boxGeometry = new THREE.BoxGeometry(width, height, depth);
    fillGroup.add(
        new THREE.Mesh(
            boxGeometry,
            new THREE.MeshPhongMaterial({
                color: 0x4b7a47,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
        ),
    );
    fillGroup.add(
        new THREE.LineSegments(
            new THREE.EdgesGeometry(boxGeometry),
            new THREE.LineBasicMaterial({ color: 0x7ddf7a, linewidth: 2 }),
        ),
    );
    fillGroup.position.set(centerX, centerY, centerZ);
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
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

init();
