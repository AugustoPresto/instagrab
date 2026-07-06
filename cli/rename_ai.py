"""
InstaGrab CLI — AI-powered photo renaming module

Uses a Vision AI model (OpenAI GPT-4o or local CLIP) to analyze
downloaded Instagram photos and rename them with meaningful, descriptive names.

Usage:
    python -m cli.rename_ai ./path/to/photos
    python -m cli.rename_ai ./path/to/photos --model gpt-4o --prefix celle
    python -m cli.rename_ai ./path/to/photos --model clip --dry-run

Requirements:
    pip install -r cli/requirements.txt
"""

import argparse
import os
import sys
import shutil
from pathlib import Path
from typing import Optional


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="instagrab-rename",
        description="AI-powered renaming of Instagram media files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m cli.rename_ai ~/Downloads/instagrab
  python -m cli.rename_ai ~/Downloads/instagrab --model gpt-4o --prefix photo
  python -m cli.rename_ai ~/Downloads/instagrab --model clip --dry-run
  python -m cli.rename_ai ~/Downloads/instagrab --sequential --prefix celle
        """,
    )
    parser.add_argument("directory", help="Directory containing photos to rename")
    parser.add_argument(
        "--model",
        choices=["gpt-4o", "clip", "sequential"],
        default="sequential",
        help="AI model to use for renaming (default: sequential)",
    )
    parser.add_argument(
        "--prefix",
        default="photo",
        help="Filename prefix for sequential mode (default: 'photo')",
    )
    parser.add_argument(
        "--start",
        type=int,
        default=1,
        help="Start index for sequential mode (default: 1)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview renames without making changes",
    )
    parser.add_argument(
        "--output-dir",
        help="Output directory (default: rename in-place)",
    )
    parser.add_argument(
        "--openai-key",
        default=os.environ.get("OPENAI_API_KEY"),
        help="OpenAI API key (or set OPENAI_API_KEY env var)",
    )
    return parser.parse_args()


def rename_sequential(
    files: list[Path],
    prefix: str,
    start: int,
    output_dir: Optional[Path],
    dry_run: bool,
) -> list[tuple[Path, Path]]:
    """Simple sequential rename: prefix1.jpg, prefix2.jpg, ..."""
    renames = []
    for i, f in enumerate(sorted(files), start=start):
        new_name = f"{prefix}{i}{f.suffix}"
        dest = (output_dir or f.parent) / new_name
        renames.append((f, dest))
    return renames


def rename_with_gpt4o(
    files: list[Path],
    api_key: str,
    output_dir: Optional[Path],
    dry_run: bool,
) -> list[tuple[Path, Path]]:
    """
    Uses OpenAI GPT-4o Vision to generate descriptive filenames.
    Sends each image as a base64-encoded message and asks for a short
    descriptive slug suitable for a filename.
    """
    try:
        import openai
        import base64
    except ImportError:
        print("❌ openai package not found. Run: pip install openai", file=sys.stderr)
        sys.exit(1)

    client = openai.OpenAI(api_key=api_key)
    renames = []

    for f in sorted(files):
        print(f"  🔍 Analyzing {f.name}...", end=" ", flush=True)

        with open(f, "rb") as img_file:
            b64 = base64.b64encode(img_file.read()).decode()

        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                max_tokens=30,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{b64}",
                                    "detail": "low",
                                },
                            },
                            {
                                "type": "text",
                                "text": (
                                    "Describe this photo in 3-5 words, lowercase, "
                                    "hyphen-separated, suitable as a filename. "
                                    "Examples: 'sunset-beach-couple', 'food-pasta-table', "
                                    "'portrait-smiling-woman'. Respond ONLY with the slug."
                                ),
                            },
                        ],
                    }
                ],
            )

            slug = response.choices[0].message.content.strip().lower()
            # Sanitize: keep only alphanumeric and hyphens
            slug = "".join(c if c.isalnum() or c == "-" else "-" for c in slug)
            slug = slug[:60]  # max length
            new_name = f"{slug}{f.suffix}"
            print(f"→ {new_name}")

        except Exception as e:
            print(f"⚠️  API error: {e} — keeping original name")
            new_name = f.name

        dest = (output_dir or f.parent) / new_name
        # Handle name collisions
        counter = 1
        while dest.exists() and dest != f:
            stem = new_name.rsplit(".", 1)[0]
            dest = (output_dir or f.parent) / f"{stem}_{counter}{f.suffix}"
            counter += 1

        renames.append((f, dest))

    return renames


def rename_with_clip(
    files: list[Path],
    output_dir: Optional[Path],
    dry_run: bool,
) -> list[tuple[Path, Path]]:
    """
    Uses local CLIP model (via OpenCLIP) to classify images against a vocabulary
    of descriptive tags, then builds filenames from top matching tags.
    Runs fully offline — no API key required.
    """
    try:
        import torch
        import open_clip
        from PIL import Image
    except ImportError:
        print(
            "❌ Required packages not found.\n"
            "Run: pip install torch open_clip_torch Pillow",
            file=sys.stderr,
        )
        sys.exit(1)

    print("  📦 Loading CLIP model (first run may take a moment)...")
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="openai"
    )
    tokenizer = open_clip.get_tokenizer("ViT-B-32")
    model.eval()

    # Vocabulary of descriptive tags
    tags = [
        "selfie", "portrait", "smile", "group of people", "friends",
        "beach", "ocean", "sunset", "nature", "forest", "mountain",
        "food", "meal", "restaurant", "coffee", "dessert",
        "city", "street", "building", "travel", "architecture",
        "fitness", "workout", "sports", "running",
        "fashion", "outfit", "style",
        "pet", "dog", "cat", "animal",
        "party", "celebration", "concert", "event",
        "art", "painting", "photography",
        "home", "interior", "decoration",
        "night", "lights", "urban",
    ]

    text_tokens = tokenizer(tags)
    with torch.no_grad():
        text_features = model.encode_text(text_tokens)
        text_features /= text_features.norm(dim=-1, keepdim=True)

    renames = []

    for f in sorted(files):
        print(f"  🔍 Analyzing {f.name}...", end=" ", flush=True)

        try:
            image = preprocess(Image.open(f).convert("RGB")).unsqueeze(0)

            with torch.no_grad():
                image_features = model.encode_image(image)
                image_features /= image_features.norm(dim=-1, keepdim=True)

            similarities = (image_features @ text_features.T).squeeze(0)
            top_k = similarities.topk(3)
            top_tags = [tags[i].replace(" ", "-") for i in top_k.indices.tolist()]
            slug = "-".join(top_tags)
            new_name = f"{slug}{f.suffix}"
            print(f"→ {new_name}")

        except Exception as e:
            print(f"⚠️  CLIP error: {e} — keeping original name")
            new_name = f.name

        dest = (output_dir or f.parent) / new_name
        counter = 1
        while dest.exists() and dest != f:
            stem = new_name.rsplit(".", 1)[0]
            dest = (output_dir or f.parent) / f"{stem}_{counter}{f.suffix}"
            counter += 1

        renames.append((f, dest))

    return renames


def apply_renames(
    renames: list[tuple[Path, Path]],
    dry_run: bool,
    output_dir: Optional[Path],
) -> None:
    """Execute or preview the rename operations."""
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Renaming {len(renames)} files:\n")

    for src, dest in renames:
        action = f"  {src.name}  →  {dest.name}"
        print(action)

        if not dry_run:
            if output_dir:
                output_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)
            else:
                src.rename(dest)

    if dry_run:
        print("\n✅ Dry run complete. No files were modified.")
    else:
        print(f"\n✅ Renamed {len(renames)} files successfully.")


def main() -> None:
    args = parse_args()

    directory = Path(args.directory).expanduser().resolve()
    if not directory.is_dir():
        print(f"❌ Directory not found: {directory}", file=sys.stderr)
        sys.exit(1)

    output_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else None

    # Find image files
    extensions = {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov"}
    files = [f for f in directory.iterdir() if f.suffix.lower() in extensions]

    if not files:
        print(f"No media files found in {directory}")
        sys.exit(0)

    print(f"📁 Found {len(files)} media files in {directory}")
    print(f"🤖 Mode: {args.model}\n")

    # Choose renaming strategy
    if args.model == "sequential":
        renames = rename_sequential(files, args.prefix, args.start, output_dir, args.dry_run)

    elif args.model == "gpt-4o":
        if not args.openai_key:
            print(
                "❌ OpenAI API key required. Set OPENAI_API_KEY or use --openai-key",
                file=sys.stderr,
            )
            sys.exit(1)
        renames = rename_with_gpt4o(files, args.openai_key, output_dir, args.dry_run)

    elif args.model == "clip":
        renames = rename_with_clip(files, output_dir, args.dry_run)

    else:
        print(f"❌ Unknown model: {args.model}", file=sys.stderr)
        sys.exit(1)

    apply_renames(renames, args.dry_run, output_dir)


if __name__ == "__main__":
    main()
