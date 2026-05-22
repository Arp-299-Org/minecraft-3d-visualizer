# Minecraft 3D Fill Visualizer

A classroom visualizer for Minecraft Education fill command coordinates.

Live page: https://minecraft-fill-visualizer.pages.dev

This tool helps students see how the numbers in a MakeCode fill block map to a 3D shape. Minecraft coordinates are powerful, but they are not especially friendly the first time students meet them: X is west/east, Y is down/up, and Z is north/south. The signs are easy to mix up, relative coordinates behave differently from world coordinates, and the ground level is often not zero.

The visualizer is designed as a live bridge between those ideas. Students can change the from/to coordinates and immediately see whether they are making a single block, a line, a wall, a floor/ceiling, or a 3D box. The coordinate inputs are constrained from `0` to `63` so student builds stay within a structure-block-friendly size.

## Classroom Purpose

- Show X, Y, and Z axes with Minecraft direction labels.
- Compare world coordinates with relative coordinates.
- Account for a non-zero ground Y level.
- Make the shape update live while students change the numbers.
- Help students reason about fill blocks before they run commands in Minecraft.

## Privacy

The app is a static HTML/JavaScript page. It does not have accounts, forms, analytics, cookies, or data storage. The self-contained build does not load Google Fonts, jsDelivr, Tailwind CDN, or any other third-party classroom-facing assets.

## Development

Install dependencies:

```bash
npm install
```

Build the self-contained site:

```bash
npm run build
```

Run the browser smoke test:

```bash
npm test
```

The build writes:

- `index.html` for the root static page
- `dist/index.html` for Cloudflare Pages direct upload
- `dist/minecraft-fill-visualizer-offline.html` for a standalone offline copy

Deploy to the existing Cloudflare Pages project:

```bash
npm run deploy
```

## Notes

This project is not affiliated with Mojang, Microsoft, Minecraft, or Minecraft Education.

## License

MIT
