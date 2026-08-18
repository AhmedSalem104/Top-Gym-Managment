#!/usr/bin/env python3
"""Promote the pinned 873-record image dataset to the operational catalog.

The original project seed is preserved as a compatibility archive before the
canonical catalog is written. Canonical records use the reserved source_id
namespace 100001..100873, so a later SQL sync can add them without rewriting
the 265 legacy rows referenced by existing workout programs.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


SOURCE_ID_OFFSET = 100000


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--current", default=Path("data/library/exercises.json"), type=Path)
    parser.add_argument("--dataset", default=Path("data/library/exercises-dataset.json"), type=Path)
    parser.add_argument("--matching", default=Path("data/library/exercise-image-matching.json"), type=Path)
    parser.add_argument("--legacy-output", default=Path("data/library/exercises-legacy.json"), type=Path)
    parser.add_argument("--mapping-output", default=Path("data/library/exercise-catalog-mapping.json"), type=Path)
    args = parser.parse_args()

    legacy = load(args.current)
    dataset = load(args.dataset)
    matching = load(args.matching)
    if not isinstance(legacy, list) or not isinstance(dataset, list):
        raise SystemExit("Catalog inputs must be JSON arrays.")
    if len(dataset) != 873:
        raise SystemExit(f"Expected 873 canonical records, got {len(dataset)}.")

    # Preserve the exact legacy schema/content for compatibility auditing and
    # for future migrations. Existing SQL rows remain the source of truth for
    # old program references; this file is a durable repository backup.
    write(args.legacy_output, legacy)

    links_by_upstream: dict[str, list[int]] = {}
    legacy_links: dict[int, dict[str, Any]] = {}
    for link in matching.get("current", {}).get("linked", []):
        if link.get("upstreamId"):
            upstream_id = str(link["upstreamId"])
            links_by_upstream.setdefault(upstream_id, []).append(int(link["legacySourceId"]))
        legacy_links[int(link["legacySourceId"])] = link
    for link in matching.get("current", {}).get("manualReview", []):
        legacy_links[int(link["legacySourceId"])] = link

    canonical: list[dict[str, Any]] = []
    active_mapping: list[dict[str, Any]] = []
    for index, item in enumerate(dataset, start=1):
        record = dict(item)
        source_id = SOURCE_ID_OFFSET + index
        upstream_id = str(record.get("upstreamId") or "")
        legacy_source_ids = sorted(set(links_by_upstream.get(upstream_id, [])))
        record["sourceId"] = source_id
        record["catalogVersion"] = 1
        record["catalogStatus"] = "active"
        record["legacySourceIds"] = legacy_source_ids
        canonical.append(record)
        active_mapping.append(
            {
                "catalogSourceId": source_id,
                "upstreamId": record.get("upstreamId"),
                "slug": record.get("slug"),
                "legacySourceIds": legacy_source_ids,
                "imageAssets": record.get("imageAssets"),
            }
        )

    legacy_mapping = []
    for index, item in enumerate(legacy, start=1):
        link = legacy_links.get(index, {})
        legacy_mapping.append(
            {
                "legacySourceId": index,
                "legacyName": item.get("name"),
                "legacyNameAr": item.get("nameAr"),
                "status": link.get("status", "legacy-only"),
                "upstreamId": link.get("upstreamId"),
                "slug": link.get("upstreamSlug"),
                "imageAssets": link.get("imageAssets"),
            }
        )

    write(args.current, canonical)
    write(
        args.mapping_output,
        {
            "version": 1,
            "catalogStatus": "canonical",
            "activeCount": len(canonical),
            "legacyCompatibilityCount": len(legacy),
            "sourceIdNamespace": {"offset": SOURCE_ID_OFFSET, "first": SOURCE_ID_OFFSET + 1, "last": SOURCE_ID_OFFSET + len(canonical)},
            "active": active_mapping,
            "legacyCompatibility": legacy_mapping,
        },
    )
    print(json.dumps({"active": len(canonical), "legacyCompatibility": len(legacy)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
