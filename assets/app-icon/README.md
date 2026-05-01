# App icon assets

## Files

| Path | Role |
|------|------|
| `app-icon-master.png` | **Source of truth** — square PNG (1024×1024) with transparency; edit this when the brand changes. |
| `../../public/*.png`, `../../public/favicon.ico` | Generated deployable icons for web + PWA (do not edit by hand). |

## Regenerate `public/` from the master

Requires [Pillow](https://pypi.org/project/Pillow/) (`pip install pillow` or use a venv):

```bash
pnpm icons:generate
```

## How this master was produced (fal.ai)

The repo cannot pass local paths to the fal MCP server, so any raw artwork was given a **temporary HTTPS URL** (for example via [tmpfiles.org](https://tmpfiles.org)) and then:

1. **`fal-ai/image-editing/text-removal`** — removes the caption under the artwork while keeping the white backdrop.
2. **`fal-ai/imageutils/rembg`** — removes the white backdrop so the squircle is on alpha.
3. **Local crop** — tight bounding box on alpha, centered **square** crop, scaled to 1024×1024 and saved as `app-icon-master.png`.

For new artwork, repeat that sequence (or equivalent tools), then run `pnpm icons:generate`.

## Optional: platform packs from the master

For stores and native shells you may want additional sizes:

- [RealFaviconGenerator](https://realfavicongenerator.net/) — upload `app-icon-master.png`, download a favicon / touch-icon bundle and merge only what you still need into `public/` if the script output is not enough.
- [pwa-asset-generator](https://github.com/elegantapp/pwa-asset-generator) — CLI from a single master; useful if you add splash screens or maskable variants later.
