#!/usr/bin/env python3
"""Resize assets/app-icon/app-icon-master.png into files under public/."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "assets" / "app-icon" / "app-icon-master.png"
PUBLIC = ROOT / "public"


def main() -> None:
    if not MASTER.is_file():
        raise SystemExit(f"Missing master icon: {MASTER}")
    PUBLIC.mkdir(parents=True, exist_ok=True)
    im = Image.open(MASTER).convert("RGBA")

    def save_png(size: int, name: str) -> None:
        im.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / name, "PNG")

    save_png(512, "android-chrome-512x512.png")
    save_png(192, "android-chrome-192x192.png")
    save_png(180, "apple-touch-icon.png")
    save_png(32, "favicon-32x32.png")
    save_png(16, "favicon-16x16.png")
    save_png(1024, "JLIcon.png")

    ico_base = im.resize((256, 256), Image.Resampling.LANCZOS)
    ico_base.save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"Wrote icons under {PUBLIC}")


if __name__ == "__main__":
    main()
