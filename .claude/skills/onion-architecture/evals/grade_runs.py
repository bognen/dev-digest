#!/usr/bin/env python3
"""Score onion-architecture review runs against evals/expected-findings.json.

Usage:
  python grade_runs.py <results-dir> [--out report.md]
  python grade_runs.py --scanner [--out report.md]      # score scripts/scan-layers.mjs alone

<results-dir> layout (one JSON file per review pass):
  <results-dir>/<config>/<fixture>/pass-<n>.json
where <config> is e.g. with_skill / without_skill and <fixture> is a key of
expected-findings.json. Each file looks like:
  {"violations": [{"file": "modules/x/y.ts", "lines": "3-5", "rule": "...", "description": "..."}]}
Only "violations" is graded; anything else in the file is ignored.
"""
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
EXPECTED = json.loads((HERE / "expected-findings.json").read_text(encoding="utf-8"))["fixtures"]


def norm_file(f: str) -> str:
    f = (f or "").replace("\\", "/").strip()
    f = re.sub(r"^\./", "", f)
    if "server/src/" in f:
        f = f.split("server/src/", 1)[1]
    return f


def parse_lines(v):
    """-> list of (start, end) intervals, or None when no usable line info."""
    if v is None or v == "":
        return None
    if isinstance(v, int):
        return [(v, v)]
    if isinstance(v, (list, tuple)):
        nums = [int(x) for x in v if str(x).lstrip("-").isdigit()]
        return [(n, n) for n in nums] or None
    out = []
    for part in re.split(r"[,;]", str(v)):
        nums = [int(x) for x in re.findall(r"\d+", part)]
        if nums:
            out.append((min(nums), max(nums)))
    return out or None


def overlaps(rng, b, pad=0):
    if not rng or b is None:
        return False
    return any(a0 <= b[1] + pad and a1 >= b[0] - pad for a0, a1 in rng)


def text_of(v):
    return " ".join(str(v.get(k, "")) for k in ("rule", "description", "fix"))


def hits_planted(v, p):
    f = norm_file(v.get("file"))
    rng = parse_lines(v.get("lines", v.get("line")))
    for loc in p["locations"]:
        if f != loc["file"]:
            continue
        if rng is None:
            if re.search(p["keywords"], text_of(v), re.I):
                return True
        elif overlaps(rng, tuple(loc["lines"]), pad=0):
            return True
    return False


def in_ranges(v, items):
    f = norm_file(v.get("file"))
    rng = parse_lines(v.get("lines", v.get("line")))
    for d in items:
        if d["file"] != f:
            continue
        if "lines" not in d:
            return True
        if rng is None or overlaps(rng, tuple(d["lines"]), pad=0):
            return True
    return False


def grade_one(fixture_key, violations):
    fx = EXPECTED[fixture_key]
    hit = {p["id"]: False for p in fx["planted"]}
    fps, extras = [], []
    for v in violations:
        matched = False
        for p in fx["planted"]:
            if hits_planted(v, p):
                hit[p["id"]] = True
                matched = True
        if matched:
            continue
        f = norm_file(v.get("file"))
        if in_ranges(v, fx["known_defects"]):
            continue
        if in_ranges(v, fx["decoys"]) or f in fx["clean_files"]:
            fps.append(v)
        else:
            extras.append(v)
    return hit, fps, extras


def load_runs(results_dir: Path):
    runs = defaultdict(lambda: defaultdict(list))  # config -> fixture -> [violations lists]
    for cfg in sorted(p for p in results_dir.iterdir() if p.is_dir()):
        for fx in sorted(p for p in cfg.iterdir() if p.is_dir()):
            for pass_file in sorted(fx.glob("pass-*.json")):
                try:
                    data = json.loads(pass_file.read_text(encoding="utf-8"))
                except Exception as e:  # noqa: BLE001
                    print(f"WARN unreadable {pass_file}: {e}", file=sys.stderr)
                    continue
                runs[cfg.name][fx.name].append((pass_file.name, data.get("violations", [])))
    return runs


def scanner_runs():
    runs = {"scanner": {}}
    for key, fx in EXPECTED.items():
        root = SKILL / fx["root"]
        out = subprocess.run(["node", str(SKILL / "scripts" / "scan-layers.mjs"), str(root), "--json"], capture_output=True, text=True, check=True)
        cands = json.loads(out.stdout)["candidates"]
        vs = [{"file": c["file"], "lines": c["line"], "rule": c["rule"], "description": c["note"]} for c in cands]
        runs["scanner"][key] = [("scan", vs)]
    return runs


def report(runs):
    lines = []
    summary = {}
    for cfg, fixtures in runs.items():
        total_hits = total_slots = total_fp = n_runs = 0
        per_violation = {}
        per_fixture_rows = []
        for key in EXPECTED:
            if key not in fixtures:
                continue
            fx = EXPECTED[key]
            passes = fixtures[key]
            fx_hits = 0
            fx_fp = 0
            for p in fx["planted"]:
                per_violation[p["id"]] = [0, 0, p["scanner_visible"]]
            for name, vs in passes:
                hit, fps, _extras = grade_one(key, vs)
                n_runs += 1
                for pid, ok in hit.items():
                    per_violation[pid][1] += 1
                    if ok:
                        per_violation[pid][0] += 1
                        fx_hits += 1
                fx_fp += len(fps)
                total_fp += len(fps)
            slots = len(fx["planted"]) * len(passes)
            total_hits += fx_hits
            total_slots += slots
            per_fixture_rows.append((key, len(passes), fx_hits, slots, fx_fp))
        summary[cfg] = (total_hits, total_slots, total_fp, n_runs)
        lines.append(f"## {cfg}")
        lines.append("")
        lines.append("| fixture | passes | planted found | recall | false positives (total / per pass) |")
        lines.append("|---|---|---|---|---|")
        for key, npass, h, s, fp in per_fixture_rows:
            lines.append(f"| {key} | {npass} | {h}/{s} | {100*h/s:.0f}% | {fp} / {fp/npass:.1f} |")
        lines.append("")
        lines.append("| planted violation | hit rate | scanner-visible |")
        lines.append("|---|---|---|")
        for pid, (h, n, vis) in per_violation.items():
            lines.append(f"| {pid} | {h}/{n} ({100*h/n:.0f}%) | {'yes' if vis else 'no'} |")
        lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append("| config | runs | recall | false positives per run |")
    lines.append("|---|---|---|---|")
    for cfg, (h, s, fp, n) in summary.items():
        lines.append(f"| {cfg} | {n} | {h}/{s} ({100*h/s:.1f}%) | {fp/n:.2f} |")
    return "\n".join(lines)


def main():
    args = sys.argv[1:]
    out = None
    if "--out" in args:
        i = args.index("--out")
        out = Path(args[i + 1])
        del args[i : i + 2]
    if "--scanner" in args:
        runs = scanner_runs()
    elif args:
        runs = load_runs(Path(args[0]))
    else:
        print(__doc__)
        sys.exit(2)
    text = report(runs)
    if out:
        out.write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
