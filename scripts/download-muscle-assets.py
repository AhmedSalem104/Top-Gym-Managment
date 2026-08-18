"""Download and normalize BodyParts3D/Anatomography muscle renders.

The API is used as the single visual source. Pillow is only used to convert
the returned PNG into the local, fixed-size WebP assets used by the UI.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "public" / "data" / "muscle-assets.json"
ASSET_ROOT = ROOT / "public" / "assets" / "muscles"


def api_url(record: dict, view: str, manifest: dict) -> str:
    camera = {"front": "front", "back": "back", "side": "left"}.get(view, "front")
    neutral = {
        "PartName": "muscle organ",
        "PartColor": manifest["imageStyle"]["neutralColor"].lstrip("#"),
        "PartOpacity": 0.28,
        "UseForBoundingBoxFlag": True,
    }
    highlighted = [
        {
            "PartID": source_id,
            "PartColor": manifest["imageStyle"]["highlightColor"].lstrip("#"),
            "PartOpacity": 1,
            "UseForBoundingBoxFlag": True,
        }
        for source_id in record.get("sourceAnatomyIds", [])
    ]
    config = {
        "Common": {
            "Model": "bp3d",
            "Version": "4.0",
            "TreeName": "isa",
            "CopyrightType": "small",
        },
        "Part": [neutral, *highlighted],
        "Window": {
            "ImageWidth": int(manifest["imageStyle"]["width"]),
            "ImageHeight": int(manifest["imageStyle"]["height"]),
            "BackgroundColor": manifest["imageStyle"]["background"].lstrip("#"),
            "BackgroundOpacity": 100,
        },
        "Camera": {"CameraMode": camera},
    }
    encoded = quote(json.dumps(config, separators=(",", ":")), safe="")
    return f'{manifest["source"]["api"]}?{encoded}'


def fetch_png(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "TOP-GYM-muscle-assets/1.0"})
    last_error = None
    for attempt in range(4):
        try:
            with urlopen(request, timeout=90) as response:
                data = response.read()
                if not data.startswith(b"\x89PNG"):
                    raise ValueError("BodyParts3D returned a non-PNG response")
                return data
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            last_error = error
            time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(str(last_error))


def write_webp(data: bytes, destination: Path, manifest: dict) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(__import__("io").BytesIO(data)) as image:
        image = image.convert("RGBA")
        target_size = (int(manifest["imageStyle"]["width"]), int(manifest["imageStyle"]["height"]))
        if image.size != target_size:
            image = image.resize(target_size, Image.Resampling.LANCZOS)
        image.save(destination, "WEBP", quality=84, method=6)


def download_one(record: dict, view: str, manifest: dict, force: bool) -> tuple[str, str, str | None]:
    destination = ASSET_ROOT / record["assetSlug"] / f"{view}.webp"
    relative = "/assets/muscles/{}/{}.webp".format(record["assetSlug"], view)
    if destination.exists() and not force:
        return record["assetSlug"], view, relative
    try:
        data = fetch_png(api_url(record, view, manifest))
        write_webp(data, destination, manifest)
        return record["assetSlug"], view, relative
    except Exception as error:  # pragma: no cover - depends on remote service
        return record["assetSlug"], view, f"ERROR: {error}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="redownload existing files")
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    mapped = [record for record in manifest["records"] if record.get("status") == "mapped"]
    unique = {}
    for record in mapped:
        unique.setdefault(record["assetSlug"], record)

    results = []
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 6))) as executor:
        futures = [
            executor.submit(download_one, record, view, manifest, args.force)
            for record in unique.values()
            for view in manifest["imageStyle"]["views"]
        ]
        for index, future in enumerate(as_completed(futures), start=1):
            result = future.result()
            results.append(result)
            if result[2] and result[2].startswith("ERROR:"):
                print(f"MUSCLE_ASSET_ERROR slug={result[0]} view={result[1]} {result[2]}", file=sys.stderr)
            elif index % 25 == 0 or index == len(futures):
                print(f"MUSCLE_ASSET_PROGRESS {index}/{len(futures)}")

    paths = {(slug, view): value for slug, view, value in results if value and not value.startswith("ERROR:")}
    errors = {(slug, view): value for slug, view, value in results if value and value.startswith("ERROR:")}
    downloaded_count = len(paths)
    for record in manifest["records"]:
        if record.get("status") != "mapped":
            record.pop("imageAssets", None)
            continue
        views = {view: paths.get((record["assetSlug"], view)) for view in manifest["imageStyle"]["views"]}
        views = {view: value for view, value in views.items() if value}
        if len(views) == len(manifest["imageStyle"]["views"]):
            record["imageAssets"] = {**views, "main": views["front"]}
        else:
            record["status"] = "manual-review"
            record["confidence"] = "none"
            record["reviewReason"] = "فشل تنزيل إحدى زوايا المصدر؛ لم يتم عرض صورة غير مكتملة."
            record.pop("imageAssets", None)

    manifest["generatedAt"] = manifest.get("generatedAt")
    manifest["stats"]["downloadedImages"] = downloaded_count
    manifest["stats"]["mappedRecordsWithImages"] = sum(1 for record in manifest["records"] if record.get("imageAssets"))
    manifest["stats"]["manualReviewRecords"] = sum(1 for record in manifest["records"] if record.get("status") == "manual-review")
    manifest["stats"]["uniqueCanonicalStructuresWithImages"] = len({record["assetSlug"] for record in manifest["records"] if record.get("imageAssets")})
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "MUSCLE_ASSETS_OK "
        f"uniqueCanonical={len(unique)} downloadedImages={downloaded_count} "
        f"recordsWithImages={manifest['stats']['mappedRecordsWithImages']} "
        f"manualReview={manifest['stats']['manualReviewRecords']} errors={len(errors)}"
    )
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
