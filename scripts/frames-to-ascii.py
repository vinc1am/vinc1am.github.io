#!/usr/bin/env python3
"""
Convert cat PNG frames → ASCII (VINC1AM-style charset).

Same glyph soup as the site wordmark:  #*@%=+FR3T:;.
Maps cell luminance → density (bright fur → denser glyphs, like buddy-cat).
PNG is glyphs only by default (fast). Optional --blur adds a photo color plate.

Live site only ships assets/cat/play/{1,2}/ (10fps play frames).
This script is for regenerating those from source PNGs offline.

Examples:
  python3 scripts/frames-to-ascii.py /path/to/nobg-frames -o /tmp/cat-ascii \\
    --cols 96 --cell-aspect 0.72 --size 864x486 --blur 7 --plate-light 0.42 \\
    --glyph-alpha 230 --color-glyphs --invert --png
  # then: ffmpeg -framerate 24 -i /tmp/cat-ascii/frame_%03d.png -vf fps=10 assets/cat/play/1/frame_%03d.png

Uses Pillow (e.g. /tmp/rembg-venv/bin/python if system python has no PIL).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError:
    print(
        "Pillow required. Try:\n  /tmp/rembg-venv/bin/python scripts/frames-to-ascii.py ...",
        file=sys.stderr,
    )
    sys.exit(1)

# Site wordmark charset (ascii.html data-chars), ordered heavy → light
CHARS_VINC1AM = "#%@*=+FR3T:;."
ALPHA_CUT = 40


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "input",
        type=Path,
        help="PNG file or directory of frame_*.png",
    )
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output dir for .txt (and optional .png). Default: <input>/ascii or alongside file",
    )
    p.add_argument(
        "--chars",
        default=CHARS_VINC1AM,
        help="Density ramp heavy→light (default: site VINC1AM charset)",
    )
    p.add_argument("--cols", type=int, default=360, help="ASCII width in cells (default 360)")
    p.add_argument(
        "--cell-aspect",
        type=float,
        default=0.39,
        help="Row density vs cols (0.39 ≈ 16:9 with mono 9×13 cells)",
    )
    p.add_argument("--invert", action="store_true", help="Dense glyphs on dark instead of bright")
    p.add_argument("--png", action="store_true", help="Also render PNG (same size as photo frames)")
    p.add_argument(
        "--size",
        default="3840x2160",
        help="PNG size WxH — keep same aspect as photo (default 3840x2160)",
    )
    p.add_argument(
        "--blur",
        type=float,
        default=0.0,
        help="Optional Gaussian blur photo plate under glyphs (0 = off, default)",
    )
    p.add_argument(
        "--glyph-alpha",
        type=int,
        default=200,
        help="ASCII ink opacity 0–255 over the blur (default 200)",
    )
    p.add_argument(
        "--color-glyphs",
        action="store_true",
        help="Tint each glyph from the photo cell (no blur plate; VINC1AM-clear)",
    )
    p.add_argument(
        "--plate-light",
        type=float,
        default=0.0,
        help="Lighten blur color plate 0–1 (mix toward white; default 0)",
    )
    return p.parse_args()


def list_frames(src: Path) -> list[Path]:
    if src.is_file():
        return [src]
    frames = sorted(src.glob("frame_*.png"))
    if not frames:
        frames = sorted(src.glob("*.png"))
    return frames


def sample_cell(
    px: list[tuple[int, int, int, int]],
    w: int,
    h: int,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
) -> tuple[float, float]:
    """Return (luminance 0..1, alpha 0..255) averaged over the cell."""
    step_x = max(1, (x1 - x0) // 3)
    step_y = max(1, (y1 - y0) // 3)
    sr = sg = sb = sa = n = 0
    for y in range(y0, y1, step_y):
        row = y * w
        for x in range(x0, x1, step_x):
            r, g, b, a = px[row + x]
            sr += r
            sg += g
            sb += b
            sa += a
            n += 1
    if n == 0:
        return 0.0, 0.0
    lum = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb) / (255.0 * n)
    return lum, sa / n


def frame_to_ascii(
    img: Image.Image,
    chars: str,
    cols: int,
    cell_aspect: float,
    invert: bool,
) -> list[str]:
    img = img.convert("RGBA")
    w, h = img.size
    raw = img.tobytes()
    # pack RGBA tuples for sample_cell
    px = [
        (raw[i], raw[i + 1], raw[i + 2], raw[i + 3])
        for i in range(0, len(raw), 4)
    ]

    # rows from aspect so circle stays round-ish in mono
    rows = max(4, int(round(cols * (h / w) * cell_aspect)))
    cw = w / cols
    ch = h / rows
    nch = len(chars)
    lines: list[str] = []

    for row in range(rows):
        chars_row: list[str] = []
        y0 = int(row * ch)
        y1 = int(min(h, (row + 1) * ch))
        for col in range(cols):
            x0 = int(col * cw)
            x1 = int(min(w, (col + 1) * cw))
            lum, alpha = sample_cell(px, w, h, x0, y0, x1, y1)
            if alpha < ALPHA_CUT:
                chars_row.append(" ")
                continue
            # Bright fur → denser glyph (site-style light cat)
            tone = (1.0 - lum) if invert else lum
            tone = max(0.0, min(1.0, tone * 1.15))
            idx = int(tone * (nch - 1))
            idx = max(0, min(nch - 1, idx))
            # Prefer mid/heavy end so sparse edge doesn't vanish
            if alpha < 170:
                idx = max(idx, nch // 3)
            chars_row.append(chars[idx])
        lines.append("".join(chars_row))
    return lines


def parse_size(s: str) -> tuple[int, int]:
    w, h = s.lower().split("x")
    return int(w), int(h)


def cell_rgba(
    src: Image.Image,
    col: int,
    row: int,
    cols: int,
    rows: int,
) -> tuple[int, int, int, int]:
    """Average RGBA of one ASCII cell in the source photo."""
    sw, sh = src.size
    x0 = int(col * sw / cols)
    x1 = int(min(sw, (col + 1) * sw / cols))
    y0 = int(row * sh / rows)
    y1 = int(min(sh, (row + 1) * sh / rows))
    if x1 <= x0 or y1 <= y0:
        return 0, 0, 0, 0
    patch = src.crop((x0, y0, x1, y1)).resize((1, 1), Image.Resampling.BOX)
    return patch.getpixel((0, 0))  # type: ignore[return-value]


def render_png(
    lines: list[str],
    out: Path,
    size: tuple[int, int],
    source: Image.Image | None = None,
    blur: float = 14.0,
    glyph_alpha: int = 200,
    color_glyphs: bool = False,
    plate_light: float = 0.0,
) -> None:
    """Rasterize WxH: optional blur plate, or crisp glyphs (optionally colored)."""
    if not lines:
        return
    width, height = size
    cols = max(len(L) for L in lines)
    rows = len(lines)
    cell_w = width / cols
    cell_h = height / rows
    # Match mosaic wordmark cell feel (~9×13) when cells are large enough
    font_size = max(8, int(min(cell_w * 1.15, cell_h * 0.92)))

    font = None
    for path in (
        "/Library/Fonts/IBMPlexMono-SemiBold.ttf",
        "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
        "/System/Library/Fonts/Monaco.ttf",
    ):
        try:
            font = ImageFont.truetype(path, font_size)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()

    src_rgba = source.convert("RGBA") if source is not None else None

    # Soft photo color plate (optional) — same idea as before; glyphs stay crisp on top
    if src_rgba is not None and blur > 0:
        base = src_rgba.resize((width, height), Image.Resampling.LANCZOS)
        blurred_rgb = base.convert("RGB").filter(ImageFilter.GaussianBlur(radius=blur))
        light = max(0.0, min(1.0, plate_light))
        if light > 0:
            white = Image.new("RGB", blurred_rgb.size, (255, 255, 255))
            blurred_rgb = Image.blend(blurred_rgb, white, light)
        r, g, b = blurred_rgb.split()
        _r, _g, _b, a = base.split()
        img = Image.merge("RGBA", (r, g, b, a))
    else:
        img = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    ink = (26, 26, 24, max(0, min(255, glyph_alpha)))
    ga = max(0, min(255, glyph_alpha))

    for r, line in enumerate(lines):
        y = r * cell_h
        for c, ch in enumerate(line):
            if ch == " ":
                continue
            fill = ink
            if color_glyphs and src_rgba is not None:
                cr, cg, cb, ca = cell_rgba(src_rgba, c, r, cols, rows)
                if ca < ALPHA_CUT:
                    continue
                # Slightly darker than the plate so glyphs read on the blur
                fill = (
                    max(0, int(cr * 0.55)),
                    max(0, int(cg * 0.55)),
                    max(0, int(cb * 0.55)),
                    max(ga, min(255, ca)),
                )
            draw.text((c * cell_w, y), ch, font=font, fill=fill)
    img = Image.alpha_composite(img, overlay)

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, optimize=True)


def main() -> int:
    args = parse_args()
    frames = list_frames(args.input)
    if not frames:
        print(f"No PNGs in {args.input}", file=sys.stderr)
        return 1

    chars = args.chars
    # single file, no -o → print only
    stdout_only = args.input.is_file() and args.output is None

    if args.output:
        out_dir = args.output
    elif args.input.is_dir():
        out_dir = args.input / "ascii"
    else:
        out_dir = args.input.parent / "ascii"

    png_size = parse_size(args.size) if args.png or not stdout_only else None

    if not stdout_only:
        out_dir.mkdir(parents=True, exist_ok=True)
        print(
            f"chars={chars!r}  cols={args.cols}  size={args.size}  "
            f"blur={args.blur}  color_glyphs={args.color_glyphs}  → {out_dir}"
        )

    for i, path in enumerate(frames, 1):
        img = Image.open(path)
        lines = frame_to_ascii(img, chars, args.cols, args.cell_aspect, args.invert)
        text = "\n".join(lines) + "\n"

        if stdout_only:
            sys.stdout.write(text)
            return 0

        stem = path.stem
        txt_path = out_dir / f"{stem}.txt"
        txt_path.write_text(text, encoding="utf-8")
        if args.png and png_size:
            render_png(
                lines,
                out_dir / f"{stem}.png",
                png_size,
                source=img,
                blur=args.blur,
                glyph_alpha=args.glyph_alpha,
                color_glyphs=args.color_glyphs,
                plate_light=args.plate_light,
            )
        if i == 1 or i == len(frames) or i % 40 == 0:
            print(f"  [{i}/{len(frames)}] {txt_path.name}")

    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
