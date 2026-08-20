from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


FRAME_COUNT = 4
CANVAS_SIZE = 64
CONTENT_SIZE = 56
ALPHA_THRESHOLD = 16
FRAME_DURATION_MS = 280
TRANSPARENT_INDEX = 255


def to_transparent_palette(frame: Image.Image) -> Image.Image:
    alpha = frame.getchannel("A")
    palette_frame = frame.convert("RGB").quantize(
        colors=TRANSPARENT_INDEX,
        method=Image.Quantize.MEDIANCUT,
    )
    palette = palette_frame.getpalette() or []
    palette.extend([0] * (768 - len(palette)))
    palette_frame.putpalette(palette)
    pixels = bytearray(palette_frame.tobytes())
    for index, alpha_value in enumerate(alpha.getdata()):
        if alpha_value <= ALPHA_THRESHOLD:
            pixels[index] = TRANSPARENT_INDEX
    palette_frame.frombytes(bytes(pixels))
    palette_frame.info["transparency"] = TRANSPARENT_INDEX
    palette_frame.info["disposal"] = 2
    return palette_frame


def build_gif(source: Path, destination: Path) -> None:
    strip = Image.open(source).convert("RGBA")
    frames: list[Image.Image] = []
    for index in range(FRAME_COUNT):
        left = round(index * strip.width / FRAME_COUNT)
        right = round((index + 1) * strip.width / FRAME_COUNT)
        frame = strip.crop((left, 0, right, strip.height))
        alpha = frame.getchannel("A").point(
            lambda value: 255 if value > ALPHA_THRESHOLD else 0
        )
        bounds = alpha.getbbox()
        if bounds is None:
            raise ValueError(f"frame {index} has no visible pixels: {source}")
        content = frame.crop(bounds)
        content.thumbnail((CONTENT_SIZE, CONTENT_SIZE), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
        canvas.alpha_composite(
            content,
            ((CANVAS_SIZE - content.width) // 2, CANVAS_SIZE - content.height),
        )
        frames.append(to_transparent_palette(canvas))

    destination.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        destination,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        optimize=False,
        transparency=TRANSPARENT_INDEX,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    build_gif(args.source, args.destination)


if __name__ == "__main__":
    main()
