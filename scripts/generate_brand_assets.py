#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image

NAVY = (0, 53, 102, 255)
BLACK_THRESHOLD = 44
ROOT = Path(__file__).resolve().parents[1]


def external_background_alpha(image: Image.Image, threshold: int = BLACK_THRESHOLD) -> Image.Image:
    """Remove only the near-black background connected to the image edge."""
    rgb = image.convert('RGB')
    width, height = rgb.size
    pixels = rgb.load()
    exterior = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def eligible(x: int, y: int) -> bool:
        r, g, b = pixels[x, y]
        return max(r, g, b) <= threshold

    def add(x: int, y: int) -> None:
        index = y * width + x
        if exterior[index] or not eligible(x, y):
            return
        exterior[index] = 1
        queue.append((x, y))

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(height):
        add(0, y)
        add(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x:
            add(x - 1, y)
        if x + 1 < width:
            add(x + 1, y)
        if y:
            add(x, y - 1)
        if y + 1 < height:
            add(x, y + 1)

    rgba = image.convert('RGBA')
    alpha = Image.new('L', (width, height), 255)
    alpha_data = bytearray([255]) * (width * height)
    for index, is_exterior in enumerate(exterior):
        if is_exterior:
            alpha_data[index] = 0
    alpha.frombytes(bytes(alpha_data))
    rgba.putalpha(alpha)
    return rgba


def contain(image: Image.Image, size: int, scale: float = 1.0, background=(0, 0, 0, 0)) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), background)
    target = max(1, round(size * scale))
    resized = image.resize((target, target), Image.Resampling.LANCZOS)
    offset = ((size - target) // 2, (size - target) // 2)
    canvas.alpha_composite(resized, offset)
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, 'PNG', optimize=True)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit('Usage: generate_brand_assets.py <source-image>')

    source = Path(sys.argv[1])
    original = Image.open(source).convert('RGB')
    square = original.resize((1024, 1024), Image.Resampling.LANCZOS)
    seal = external_background_alpha(square)

    images = ROOT / 'assets' / 'images'
    icon_assets = ROOT / 'assets' / 'expo.icon' / 'Assets'

    save_png(seal, images / 'CHC_Artists.png')
    save_png(seal.resize((512, 512), Image.Resampling.LANCZOS), images / 'CHC_Artists_sm.png')
    save_png(seal.resize((256, 256), Image.Resampling.LANCZOS), images / 'CHC_Artists_sm_web.png')
    save_png(seal.resize((128, 128), Image.Resampling.LANCZOS), images / 'favicon.png')
    save_png(seal, images / 'splash-icon.png')

    app_icon = contain(seal, 1024, 0.92, NAVY)
    save_png(app_icon, images / 'CHC_Artists_App.png')

    adaptive_background = Image.new('RGBA', (1024, 1024), NAVY)
    adaptive_foreground = contain(seal, 1024, 0.78)
    save_png(adaptive_background, images / 'android-icon-background.png')
    save_png(adaptive_foreground, images / 'android-icon-foreground.png')

    # Android themed icon: retain the logo's tonal structure as opacity while
    # allowing Android to supply the user's system theme color.
    gray = adaptive_foreground.convert('L')
    source_alpha = adaptive_foreground.getchannel('A')
    mono_alpha = Image.new('L', gray.size)
    gray_bytes = gray.tobytes()
    alpha_bytes = source_alpha.tobytes()
    mono_alpha.frombytes(bytes((a * max(40, g) // 255) if a else 0 for g, a in zip(gray_bytes, alpha_bytes)))
    monochrome = Image.new('RGBA', (1024, 1024), (255, 255, 255, 0))
    monochrome.putalpha(mono_alpha)
    save_png(monochrome, images / 'android-icon-monochrome.png')

    save_png(seal, icon_assets / 'CHC_Artists.png')
    icon_json = {
        'fill': {'automatic-gradient': 'extended-srgb:0.00000,0.20784,0.40000,1.00000'},
        'groups': [
            {
                'layers': [{'image-name': 'CHC_Artists.png', 'name': 'CHC Artists'}],
                'shadow': {'kind': 'neutral', 'opacity': 0.35},
            }
        ],
        'supported-platforms': {'circles': ['watchOS'], 'squares': 'shared'},
    }
    icon_json_path = ROOT / 'assets' / 'expo.icon' / 'icon.json'
    icon_json_path.parent.mkdir(parents=True, exist_ok=True)
    icon_json_path.write_text(json.dumps(icon_json, indent=2) + '\n', encoding='utf-8')

    print('Generated CHC Artists branding assets.')


if __name__ == '__main__':
    main()
