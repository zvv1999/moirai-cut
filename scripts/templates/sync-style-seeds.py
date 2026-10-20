#!/usr/bin/env python3
"""Check/export existing definition seeds from the authoritative native library.

This only writes repository JSON with --write; it never saves library assets,
transfers reviews, or exports per-input Applications. Validation belongs to Rust.
"""

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("names", nargs="*", help="Seed filenames (default: all definition seeds)")
    parser.add_argument("--write", action="store_true", help="Export verified definitions; otherwise check only")
    parser.add_argument("--base-url", default=os.environ.get("WORKBENCH_URL", "http://127.0.0.1:3000"))
    parser.add_argument("--report", type=Path, help="Optional audit output outside the seeds directory")
    args = parser.parse_args()
    seed_dir = Path(__file__).resolve().parent / "seeds"
    if args.report and args.report.resolve().is_relative_to(seed_dir.resolve()):
        parser.error("--report must be outside the seeds directory; it cannot replace a definition")
    base = args.base_url.rstrip("/") + "/api/footage/templates"

    def api(path, body=None):
        request = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers={
            "content-type": "application/json", "x-requested-with": "moirai-footage",
        })
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)

    def fingerprint(value):
        return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    paths = []
    for name in args.names:
        if Path(name).name != name or not name.endswith(".json"):
            parser.error("Provide seed filenames only, e.g. clock.json")
        paths.append(seed_dir / name)
    if not paths:
        paths = sorted(seed_dir.glob("*.json"))
    assets = {asset["id"]: asset for asset in api("/dynamic-assets")["assets"]}
    changes, records = [], []
    for path in paths:
        old = json.loads(path.read_text())
        if old.get("schemaVersion") != "moirai.dynamic-asset.v1":
            if args.names:
                raise ValueError(f"{path.name} is not a dynamic asset definition")
            continue
        saved = assets[old["id"]]
        desired = copy.deepcopy(saved)
        desired["revision"] = 0
        # Definition seeds do not carry local media by accident. Bound artwork
        # needs a separate portable asset package, not a machine-local ID dump.
        if desired.get("resourceBindings"):
            raise ValueError(f"{path.name}: package media dependencies separately before exporting")
        inspected = api("/dynamic-assets/inspect", desired)["definition"]
        if inspected != desired:
            raise ValueError(f"{path.name}: native normalization changed the saved definition; review first")
        changed = [key for key in sorted(set(old) | set(desired))
                   if key not in old or key not in desired or old[key] != desired[key]]
        records.append({"file": path.name, "assetId": saved["id"], "sourceRevision": saved["revision"],
                        "changedFields": changed, "seedSha256": fingerprint(desired), "nativeRoundtripExact": True})
        if changed:
            changes.append((path, desired))

    # Finish all validation before writing, and detect concurrent library edits.
    latest = {asset["id"]: asset for asset in api("/dynamic-assets")["assets"]}
    for record in records:
        if latest.get(record["assetId"]) != assets[record["assetId"]]:
            raise RuntimeError(f"Library changed during export: {record['assetId']}; retry")
    if args.write:
        for path, definition in changes:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=seed_dir, delete=False) as temporary:
                temporary.write(json.dumps(definition, ensure_ascii=False, indent=2) + "\n")
                temporary_path = Path(temporary.name)
            temporary_path.chmod(path.stat().st_mode & 0o777)
            temporary_path.replace(path)
    report = {"mode": "write" if args.write else "check", "definitions": len(records),
              "changed": len(changes), "libraryMutated": False, "reviewsTransferred": False, "records": records}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if args.write or not changes else 1


if __name__ == "__main__":
    raise SystemExit(main())
