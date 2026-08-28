#!/usr/bin/env python3
"""Build local monochrome PNG assets from the Simple Icons source repository.

The images preserve each brand's actual mark silhouette while using a white alpha
mask. The app applies the active frame foreground color at render time, so the
same recognisable logo is readable on light and dark frame themes.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.request import Request, urlopen

import cairosvg
from PIL import Image


BRANDS = {
    "sony": ("Sony", None),
    "canon": (
        "Canon",
        "https://upload.wikimedia.org/wikipedia/commons/8/8d/Canon_logo.svg",
    ),
    "nikon": ("Nikon", None),
    "fujifilm": ("Fujifilm", None),
    "leica": ("Leica", None),
    "hasselblad": (
        "Hasselblad",
        "https://upload.wikimedia.org/wikipedia/commons/6/6b/Hasselblad_Logo.svg",
    ),
    "panasonic": ("Panasonic", None),
    "apple": ("Apple", None),
    "samsung": ("Samsung", None),
    "google": ("Google", None),
    "huawei": ("Huawei", None),
    "xiaomi": ("Xiaomi", None),
    "oppo": ("OPPO", None),
    "vivo": ("vivo", None),
}

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "assets" / "brand-logos"
SOURCE_TEMPLATE = (
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/{slug}.svg"
)


def fetch_svg(slug: str, source_url: str | None) -> tuple[bytes, str]:
    resolved_url = source_url or SOURCE_TEMPLATE.format(slug=slug)
    request = Request(
        resolved_url,
        headers={"User-Agent": "RAW-View-brand-logo-builder/1.0"},
    )
    with urlopen(request, timeout=30) as response:  # noqa: S310 - fixed GitHub HTTPS URL
        content = response.read()
    if b"<svg" not in content[:2048]:
        raise RuntimeError(f"{slug}: received an invalid SVG response")
    return content, resolved_url


def create_alpha_mask(svg: bytes, destination: Path) -> None:
    rendered = cairosvg.svg2png(
        bytestring=svg,
        output_width=512,
        output_height=512,
        background_color=None,
    )
    temp = destination.with_suffix(".source.png")
    temp.write_bytes(rendered)
    with Image.open(temp).convert("RGBA") as source:
        alpha = source.getchannel("A")
        bounds = alpha.getbbox()
        if bounds is None:
            raise RuntimeError(f"{destination.name}: the source SVG rendered empty")
        cropped_alpha = alpha.crop(bounds)
        padding = max(8, round(max(cropped_alpha.size) * 0.08))
        output = Image.new(
            "RGBA",
            (cropped_alpha.width + padding * 2, cropped_alpha.height + padding * 2),
            (255, 255, 255, 0),
        )
        output.putalpha(
            Image.new("L", output.size, 0),
        )
        output_alpha = Image.new("L", output.size, 0)
        output_alpha.paste(cropped_alpha, (padding, padding))
        output.putalpha(output_alpha)
        output.save(destination, "PNG", optimize=True)
    temp.unlink(missing_ok=True)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for slug, (brand, source_url) in BRANDS.items():
        svg, resolved_url = fetch_svg(slug, source_url)
        destination = OUTPUT_DIR / f"{slug}.png"
        create_alpha_mask(svg, destination)
        manifest.append(
            {
                "brand": brand,
                "slug": slug,
                "file": destination.name,
                "source": resolved_url,
            }
        )
        print(f"Built {destination.relative_to(ROOT)}")
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
