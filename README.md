# Minecraft 3D Fill Visualizer

A classroom visualizer for Minecraft Education fill command coordinates.

Live page: https://minecraft-fill-visualizer.pages.dev

This tool helps students see how the numbers in a MakeCode fill block map to a 3D shape. Minecraft supports three coordinate modes that behave very differently: world coordinates (`X` west/east, `Y` down/up, `Z` north/south), compass-locked relative coordinates (`~`), and player-facing coordinates (`^` left/up/forward).

Students can switch between `World`, `~`, and `^`, rotate facing direction (`N / E / S / W`) to see `posLocal()` turn in 3D space, open the built-in plain-English coordinate key, copy the live MakeCode snippet (`world()`, `pos()`, or `posLocal()`), and watch the block volume update as they change numbers. Inputs stay constrained within a 63-block structure-friendly span.

## Classroom Purpose

- Toggle between **World (`world`)**, **Relative (`~` / `pos`)**, and **Facing (`^` / `posLocal`)** coordinates.
- Rotate player facing (`N / E / S / W`) in `^` mode to see `Left (+^1)`, `Up (+^2)`, and `Forward (+^3)` turn live around the player.
- Account for a non-zero ground `Y` level (`-60` by default for flat worlds).
- Copy the matching MakeCode JavaScript (`blocks.fill(...)`) directly from the live preview.
- Keep a compact plain-English `? Key` one click away without leaving the 3D scene.

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

Run the Playwright browser smoke test:

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
