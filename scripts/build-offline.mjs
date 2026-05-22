import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sourceHtmlPath = path.join(rootDir, 'src', 'index.template.html');
const sourceScriptPath = path.join(rootDir, 'src', 'app.js');
const outputDir = path.join(rootDir, 'dist');
const rootOutputPath = path.join(rootDir, 'index.html');
const outputPath = path.join(outputDir, 'minecraft-fill-visualizer-offline.html');
const outputIndexPath = path.join(outputDir, 'index.html');
const moduleScriptTag = '<script type="module" src="./src/app.js"></script>';
const bundlePlaceholder = '__OFFLINE_APP_BUNDLE__';

const offlineUtilityCss = `
        .hidden { display: none !important; }
        .fixed { position: fixed; }
        .bottom-3 { bottom: 0.75rem; }
        .right-3 { right: 0.75rem; }
        .z-10 { z-index: 10; }
        .pointer-events-auto { pointer-events: auto; }
        .bg-\\[\\#2a2a3e\\] { background-color: rgba(42, 42, 62, 0.9); }
        .bg-\\[\\#333350\\] { background-color: #333350; }
        .bg-\\[\\#3a3a52\\] { background-color: #3a3a52; }
        .bg-opacity-90 { }
        .backdrop-blur-sm {
            -webkit-backdrop-filter: blur(4px);
            backdrop-filter: blur(4px);
        }
        .rounded-lg { border-radius: 0.5rem; }
        .rounded-t-lg {
            border-top-left-radius: 0.5rem;
            border-top-right-radius: 0.5rem;
        }
        .shadow-xl { box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.35), 0 8px 10px -6px rgba(0, 0, 0, 0.35); }
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .items-center { align-items: center; }
        .items-end { align-items: end; }
        .justify-between { justify-content: space-between; }
        .justify-center { justify-content: center; }
        .gap-1 { gap: 0.25rem; }
        .gap-1\\.5 { gap: 0.375rem; }
        .gap-2 { gap: 0.5rem; }
        .p-2 { padding: 0.5rem; }
        .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
        .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
        .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
        .grid { display: grid; }
        .grid-cols-\\[2\\.5rem_2\\.2rem_1fr_1fr_1fr\\] { grid-template-columns: 2.5rem 2.2rem 1fr 1fr 1fr; }
        .overflow-hidden { overflow: hidden; }
        .text-center { text-align: center; }
        .text-white { color: #ffffff; }
        .text-gray-200 { color: #e5e7eb; }
        .text-gray-300 { color: #d1d5db; }
        .text-gray-400 { color: #9ca3af; }
        .text-green-100 { color: #dcfce7; }
        .text-green-300 { color: #86efac; }
        .text-green-400 { color: #4ade80; }
        .text-red-300 { color: #fca5a5; }
        .text-red-400 { color: #f87171; }
        .text-blue-300 { color: #93c5fd; }
        .text-blue-400 { color: #60a5fa; }
        .text-cyan-300 { color: #67e8f9; }
        .text-yellow-300 { color: #fde047; }
        .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
        .text-xs { font-size: 0.75rem; line-height: 1rem; }
        .text-\\[9px\\] { font-size: 9px; }
        .text-\\[10px\\] { font-size: 10px; }
        .text-\\[11px\\] { font-size: 11px; }
        .w-3 { width: 0.75rem; }
        .h-3 { height: 0.75rem; }
        .w-14 { width: 3.5rem; }
        .h-\\[1px\\] { height: 1px; }
        .ml-1 { margin-left: 0.25rem; }
        .cursor-pointer { cursor: pointer; }
        .accent-green-500 { accent-color: #22c55e; }
`;

const html = await readFile(sourceHtmlPath, 'utf8');
const bundleResult = await build({
    entryPoints: [sourceScriptPath],
    bundle: true,
    format: 'iife',
    legalComments: 'none',
    minify: true,
    platform: 'browser',
    write: false,
});

const bundledScript = bundleResult.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

let offlineHtml = html
    .replace(moduleScriptTag, bundlePlaceholder)
    .replace('</style>', `${offlineUtilityCss}\n    </style>`)
    .replace(
        '</head>',
        '    <meta name="offline-build" content="true">\n</head>',
    );

offlineHtml = offlineHtml.split(bundlePlaceholder).join(`<script>\n${bundledScript}\n</script>`);

await mkdir(outputDir, { recursive: true });
await writeFile(rootOutputPath, offlineHtml, 'utf8');
await writeFile(outputIndexPath, offlineHtml, 'utf8');
await writeFile(outputPath, offlineHtml, 'utf8');

console.log(`Built site files: ${rootOutputPath}, ${outputIndexPath}, and ${outputPath}`);
