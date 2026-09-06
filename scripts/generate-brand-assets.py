"""Generate LandDraft raster icons from the official parcel-survey mark.

The SVG files remain the vector source of truth. This script keeps favicon,
Apple touch, install, and social-preview assets visually consistent.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
GREEN = "#227448"
CREAM = "#FFF9E9"
PAPER = "#F7F4E9"
INK = "#173328"
MUTED = "#5D6D65"


def draw_mark(size: int, *, maskable: bool = False) -> Image.Image:
    scale = 4
    canvas_size = size * scale
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    radius = 0 if maskable else 16 * canvas_size / 64
    draw.rounded_rectangle((0, 0, canvas_size, canvas_size), radius=radius, fill=GREEN)

    # Maskable icons keep the parcel inside the platform-safe central region.
    inset = 5 if maskable else 0
    factor = (64 - inset * 2) / 64

    def point(x: float, y: float) -> tuple[float, float]:
        return ((inset + x * factor) * canvas_size / 64, (inset + y * factor) * canvas_size / 64)

    outer = [
        point(12.5, 47.5),
        point(17, 15),
        point(41.5, 9),
        point(52.5, 23.5),
        point(47.5, 49.5),
        point(22.5, 55),
        point(12.5, 47.5),
    ]
    draw.line(
        outer,
        fill=CREAM,
        width=max(1, round(4.3 * factor * canvas_size / 64)),
        joint="curve",
    )
    draw.line(
        [point(17, 15), point(31.5, 27.5), point(52.5, 23.5)],
        fill=CREAM,
        width=max(1, round(3.6 * factor * canvas_size / 64)),
        joint="curve",
    )
    draw.line(
        [point(31.5, 27.5), point(22.5, 55)],
        fill=CREAM,
        width=max(1, round(3.6 * factor * canvas_size / 64)),
    )
    cx, cy = point(31.5, 27.5)
    circle_radius = 4.3 * factor * canvas_size / 64
    draw.ellipse(
        (cx - circle_radius, cy - circle_radius, cx + circle_radius, cy + circle_radius),
        fill=CREAM,
    )
    return image.resize((size, size), Image.Resampling.LANCZOS)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    windows_font = Path("C:/Windows/Fonts") / name
    return ImageFont.truetype(str(windows_font), size=size)


def draw_social_card() -> Image.Image:
    image = Image.new("RGB", (1200, 630), PAPER)
    draw = ImageDraw.Draw(image)
    draw.ellipse((830, -235, 1310, 245), fill="#E4EFDC")
    draw.ellipse((-210, 475, 320, 1005), fill="#EFE8CF")
    mark = draw_mark(152)
    image.paste(mark, (104, 166), mark)
    draw.text((296, 174), "LandDraft", font=font("arialbd.ttf", 78), fill=INK)
    draw.text((300, 270), "Map, measure and shape the land", font=font("arial.ttf", 34), fill=MUTED)
    draw.rounded_rectangle((300, 341, 765, 403), radius=31, fill=GREEN)
    draw.text((335, 355), "FRIENDLY MAPS · REAL GIS POWER", font=font("arialbd.ttf", 22), fill=CREAM)
    return image


def main() -> None:
    for size, name in (
        (16, "favicon-16x16.png"),
        (32, "favicon-32x32.png"),
        (120, "landdraft-mark-120.png"),
        (180, "apple-touch-icon.png"),
        (192, "landdraft-icon-192.png"),
        (512, "landdraft-icon-512.png"),
    ):
        draw_mark(size).save(PUBLIC / name, optimize=True)

    draw_mark(512, maskable=True).save(PUBLIC / "landdraft-maskable-512.png", optimize=True)
    draw_social_card().save(PUBLIC / "landdraft-social-card.png", optimize=True)

    draw_mark(256).save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()
