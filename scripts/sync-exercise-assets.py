#!/usr/bin/env python3
"""Build the local exercise image catalog from one pinned upstream dataset.

This is a build-time utility. It does not touch the SQL database and it does
not change the existing library API. Install Pillow before running it:
    python -m pip install Pillow
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


SOURCE_REPOSITORY = "yuhonas/free-exercise-db"
SOURCE_REVISION = "b0eed061e1c832b3ed815fbaa4b45b3cdc14df49"
SOURCE_LICENSE = "Unlicense (as declared by the upstream repository)"
SOURCE_COMMIT_URL = f"https://github.com/{SOURCE_REPOSITORY}/tree/{SOURCE_REVISION}"
TARGET_SIZE = (720, 480)
# The SQL library previously derived source_id from the position in the
# 265-item project seed.  Canonical upstream records use a separate namespace
# so an additive sync can never overwrite an old row by position.
CATALOG_SOURCE_ID_OFFSET = 100000


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def slugify(value: Any) -> str:
    return normalize(str(value).replace("_", " ")).replace(" ", "-")


def token_score(left: str, right: str) -> float:
    left_tokens = set(normalize(left).split())
    right_tokens = set(normalize(right).split())
    if not left_tokens or not right_tokens:
        return 0.0
    intersection = len(left_tokens & right_tokens)
    union = len(left_tokens | right_tokens)
    jaccard = intersection / union
    sequence = difflib.SequenceMatcher(None, normalize(left), normalize(right)).ratio()
    return round((jaccard * 0.62) + (sequence * 0.38), 4)


def image_path(record_id: str, phase: str) -> str:
    return f"/assets/exercises/{record_id}/{phase}.webp"


def convert_image(source_path: Path, target_path: Path) -> None:
    if target_path.exists() and target_path.stat().st_size > 0:
        return
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source_path) as source:
        image = source.convert("RGB")
        image = ImageOps.pad(
            image,
            TARGET_SIZE,
            method=Image.Resampling.LANCZOS,
            color=(248, 250, 252),
            centering=(0.5, 0.5),
        )
        image.save(target_path, format="WEBP", quality=82, method=6)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_upstream_records(source_root: Path, assets_root: Path, upstream: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = []
    for item in upstream:
        record_id = str(item["id"])
        source_images = list(item.get("images") or [])
        phases = {"start": None, "end": None}
        image_audit = {"expected": ["0.jpg", "1.jpg"], "status": "complete", "missing": []}
        for phase, source_ref in zip(("start", "end"), source_images[:2]):
            source_path = source_root / "exercises" / source_ref
            target_path = assets_root / record_id / f"{phase}.webp"
            if not source_path.exists():
                image_audit["status"] = "image_missing"
                image_audit["missing"].append(source_ref)
                continue
            convert_image(source_path, target_path)
            phases[phase] = image_path(record_id, phase)
        if len(source_images) < 2:
            image_audit["status"] = "image_missing"
            image_audit["missing"].extend(["0.jpg", "1.jpg"][len(source_images):])

        record = dict(item)
        record.update(
            {
                "slug": slugify(record_id),
                "imageAssets": {
                    "main": phases["start"],
                    "start": phases["start"],
                    "end": phases["end"],
                },
                "imageAudit": image_audit,
            }
        )
        records.append(record)
    return records


def build_muscle_index(muscles: list[dict[str, Any]]) -> dict[str, int]:
    return {normalize(item.get("name")): index for index, item in enumerate(muscles, start=1) if normalize(item.get("name"))}


def muscle_id(muscle_name: Any, index: dict[str, int]) -> int | None:
    return index.get(normalize(muscle_name))


def project_style_record(
    record: dict[str, Any], muscle_index: dict[str, int], catalog_source_id: int
) -> dict[str, Any]:
    primary = (record.get("primaryMuscles") or [None])[0]
    secondary = []
    for name in record.get("secondaryMuscles") or []:
        resolved = muscle_id(name, muscle_index)
        if resolved:
            secondary.append({"muscleId": resolved, "contributionPercent": 0})
    return {
        "sourceId": catalog_source_id,
        "catalogVersion": 1,
        "name": record.get("name"),
        "nameAr": None,
        "description": None,
        "descriptionAr": None,
        "targetMuscleId": muscle_id(primary, muscle_index),
        "secondaryMuscles": secondary,
        "equipment": record.get("equipment"),
        "isHighImpact": False,
        "difficulty": record.get("level"),
        "category": record.get("category"),
        "movementPattern": None,
        "mechanic": record.get("mechanic"),
        "force": record.get("force"),
        "instructions": record.get("instructions") or [],
        "instructionsAr": [],
        "tips": [],
        "tipsAr": [],
        "commonMistakes": [],
        "commonMistakesAr": [],
        "repsRange": None,
        "setsRange": None,
        "restSeconds": None,
        "tempo": None,
        "icon": "🏋️",
        "videoUrl": None,
        "upstreamId": record.get("id"),
        "slug": record.get("slug"),
        "sourceImagePaths": record.get("images") or [],
        "imageAssets": record.get("imageAssets"),
        "imageAudit": record.get("imageAudit"),
    }


def make_project_links(current: list[dict[str, Any]], records: list[dict[str, Any]], aliases: dict[str, str]) -> list[dict[str, Any]]:
    by_name: dict[str, list[dict[str, Any]]] = {}
    by_id = {str(record["id"]): record for record in records}
    for record in records:
        by_name.setdefault(normalize(record["name"]), []).append(record)

    links = []
    for index, item in enumerate(current, start=1):
        project_name = str(item.get("name") or "")
        normalized_name = normalize(project_name)
        candidates = sorted(
            (
                {
                    "upstreamId": str(record["id"]),
                    "nameEn": record["name"],
                    "score": token_score(project_name, record["name"]),
                }
                for record in records
            ),
            key=lambda candidate: candidate["score"],
            reverse=True,
        )[:3]

        selected = None
        status = "missing"
        method = None
        confidence = 0.0
        exact_matches = by_name.get(normalized_name, [])
        if len(exact_matches) == 1:
            selected = exact_matches[0]
            status = "exact"
            method = "normalized_name"
            confidence = 1.0
        elif len(exact_matches) > 1:
            status = "ambiguous"
        else:
            alias_name = aliases.get(project_name)
            alias_matches = by_name.get(normalize(alias_name), []) if alias_name else []
            if len(alias_matches) == 1:
                selected = alias_matches[0]
                status = "alias"
                method = "curated_alias"
                confidence = 0.98
            elif alias_name and alias_name in by_id:
                selected = by_id[alias_name]
                status = "alias"
                method = "curated_alias_id"
                confidence = 0.98

        if selected and selected.get("imageAudit", {}).get("status") != "complete":
            status = "image_missing"
            confidence = 0.0

        link = {
            "legacySourceId": index,
            "projectNameEn": project_name,
            "projectNameAr": item.get("nameAr"),
            "upstreamId": selected.get("id") if selected else None,
            "upstreamSlug": selected.get("slug") if selected else None,
            "status": status,
            "method": method,
            "confidence": confidence,
            "candidates": candidates,
            "imageAssets": selected.get("imageAssets") if selected and status in {"exact", "alias"} else None,
        }
        links.append(link)
    return links


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path, help="Checked-out free-exercise-db root")
    parser.add_argument("--current", default=Path("data/library/exercises.json"), type=Path)
    parser.add_argument("--muscles", default=Path("data/library/muscles.json"), type=Path)
    parser.add_argument("--aliases", default=Path("data/library/exercise-image-aliases.json"), type=Path)
    parser.add_argument("--assets-root", default=Path("public/assets/exercises"), type=Path)
    parser.add_argument("--dataset-output", default=Path("data/library/exercises-dataset.json"), type=Path)
    parser.add_argument("--manifest-output", default=Path("public/data/exercise-assets.json"), type=Path)
    parser.add_argument("--matching-output", default=Path("data/library/exercise-image-matching.json"), type=Path)
    args = parser.parse_args()

    source_root = args.source_root.resolve()
    upstream = load_json(source_root / "dist" / "exercises.json")
    current = load_json(args.current)
    muscles = load_json(args.muscles)
    aliases = load_json(args.aliases)
    assets_root = args.assets_root.resolve()

    records = build_upstream_records(source_root, assets_root, upstream)
    links = make_project_links(current, records, aliases)
    muscle_index = build_muscle_index(muscles)
    project_style_records = [
        project_style_record(record, muscle_index, CATALOG_SOURCE_ID_OFFSET + index)
        for index, record in enumerate(records, start=1)
    ]
    counts: dict[str, int] = {}
    for link in links:
        counts[link["status"]] = counts.get(link["status"], 0) + 1

    source_meta = {
        "provider": "yuhonas",
        "repository": SOURCE_REPOSITORY,
        "revision": SOURCE_REVISION,
        "revisionUrl": SOURCE_COMMIT_URL,
        "license": SOURCE_LICENSE,
        "recordCount": len(records),
        "imageFormat": "webp",
        "imageSize": {"width": TARGET_SIZE[0], "height": TARGET_SIZE[1]},
        "imagePhases": {"main": "start", "start": "start", "end": "end"},
        "catalogSourceIdOffset": CATALOG_SOURCE_ID_OFFSET,
    }

    # Keep the archive as a plain array, exactly like data/library/exercises.json.
    # Source and matching metadata live in the manifest/report so consumers can
    # use this file with the existing library-data shape without an adapter.
    dataset_payload = project_style_records
    manifest_records = [
        {
            "catalogSourceId": CATALOG_SOURCE_ID_OFFSET + index,
            "upstreamId": record["id"],
            "slug": record["slug"],
            "nameEn": record["name"],
            "level": record.get("level"),
            "equipment": record.get("equipment"),
            "primaryMuscles": record.get("primaryMuscles") or [],
            "secondaryMuscles": record.get("secondaryMuscles") or [],
            "category": record.get("category"),
            "imageAssets": record["imageAssets"],
            "imageAudit": record["imageAudit"],
        }
        for index, record in enumerate(records, start=1)
    ]
    manifest_payload = {
        "manifestVersion": 2,
        "source": source_meta,
        "counts": {
            "datasetExercises": len(records),
            "projectExercises": len(current),
            "projectLinks": counts,
        },
        "records": manifest_records,
        "projectLinks": links,
    }
    linked_upstream_ids = {str(link["upstreamId"]) for link in links if link.get("upstreamId") and link.get("status") in {"exact", "alias"}}
    matching_payload = {
        "source": source_meta,
        "counts": {
            "currentExercises": len(current),
            "exact": counts.get("exact", 0),
            "curatedAlias": counts.get("alias", 0),
            "manualReview": counts.get("missing", 0) + counts.get("ambiguous", 0) + counts.get("image_missing", 0),
            "datasetExercises": len(records),
            "newDatasetExercises": len(records) - len(linked_upstream_ids),
        },
        "current": {
            "linked": [link for link in links if link.get("status") in {"exact", "alias"}],
            "manualReview": [link for link in links if link.get("status") not in {"exact", "alias"}],
        },
        "newDatasetExercises": [
            {"upstreamId": record["id"], "slug": record["slug"], "nameEn": record["name"], "imageAssets": record["imageAssets"]}
            for record in records if str(record["id"]) not in linked_upstream_ids
        ],
    }
    write_json(args.dataset_output, dataset_payload)
    write_json(args.manifest_output, manifest_payload)
    write_json(args.matching_output, matching_payload)

    print(json.dumps({"records": len(records), "links": counts, "assetsRoot": str(assets_root)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
