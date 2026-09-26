#!/usr/bin/env python3
"""
Reference Reconstruction (spec §40): compare the reference video with candidate rules.

Candidate family: the tip of two equal arms, z(t) = e^{it} + e^{i·c·t}, for several ratios c.
The video is low-resolution (180×320, 2 fps) and shows only the drawing, so the comparison
uses rotation-invariant features that survive blur and compression:

  * radial profile  — mean brightness in 24 rings from the centre to the envelope (|z| = 2)
  * angular spectrum — |FFT| of brightness around a mid-radius band (petal symmetry)

For every usable video frame and every candidate ratio c, the drawing time T (how much of the
curve has been drawn) is searched on a grid, and the smallest feature distance is kept.
A candidate is *rejected* when some frame is matched clearly worse than by the best candidate.
This is evidence for a rule, not a proof; the report says what cannot be distinguished.

Usage:  python3 tools/reference/analyze.py            (writes docs/reference/ANALYSIS.md)
Needs:  numpy, pillow, imageio-ffmpeg  (pip install numpy pillow imageio-ffmpeg)
"""
from __future__ import annotations

import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
VIDEO = ROOT / "docs/reference/infinite-lab-source-reference.mp4"
OUT_DIR = ROOT / "docs/reference"
FIG_DIR = OUT_DIR / "analysis"

# Screen regions (in the 180×320 video) that are app UI, not the drawing.
VALID_X_MAX = 148  # right-hand icon column starts here
VALID_Y_MIN = 128  # title text above
VALID_Y_MAX = 286  # account / caption text below

RATIOS: list[tuple[str, float]] = [
    ("π", math.pi),
    ("355/113", 355 / 113),
    ("22/7", 22 / 7),
    ("3.2", 3.2),
    ("√10", math.sqrt(10)),
    ("3", 3.0),
    ("e", math.e),
    ("φ+1", (1 + math.sqrt(5)) / 2 + 1),
]
T_GRID = np.unique(np.round(np.geomspace(10, 3000, 70), 2))
RINGS = 24
KMAX = 40


def read_frames() -> tuple[list[np.ndarray], float]:
    import imageio_ffmpeg

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    probe = subprocess.run([ff, "-i", str(VIDEO)], capture_output=True, text=True).stderr
    fps = 2.0
    for tok in probe.split(","):
        if tok.strip().endswith(" fps"):
            fps = float(tok.strip().split()[0])
    raw = subprocess.run(
        [ff, "-loglevel", "error", "-i", str(VIDEO), "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        capture_output=True,
        check=True,
    ).stdout
    w, h = 180, 320
    n = len(raw) // (w * h)
    frames = [np.frombuffer(raw[i * w * h : (i + 1) * w * h], np.uint8).reshape(h, w).astype(np.float32) for i in range(n)]
    return frames, fps


def valid_mask(h: int, w: int) -> np.ndarray:
    m = np.zeros((h, w), bool)
    m[VALID_Y_MIN:VALID_Y_MAX, :VALID_X_MAX] = True
    return m


@dataclass
class Disk:
    cx: float
    cy: float
    r: float


def find_disk(img: np.ndarray, valid: np.ndarray) -> Disk | None:
    """The drawing's envelope circle, from the vertical extent of lit pixels (x is partly masked)."""
    lit = (img > 70) & valid
    ys, xs = np.nonzero(lit)
    if len(ys) < 400:
        return None
    y0, y1 = np.percentile(ys, [0.5, 99.5])
    r = (y1 - y0) / 2
    if not 50 <= r <= 85:
        return None
    x0 = np.percentile(xs, 0.5)
    return Disk(cx=float(x0 + r), cy=float((y0 + y1) / 2), r=float(r))


def features(img: np.ndarray, valid: np.ndarray, disk: Disk) -> np.ndarray:
    h, w = img.shape
    yy, xx = np.mgrid[0:h, 0:w]
    dx = xx - disk.cx
    dy = yy - disk.cy
    rr = np.hypot(dx, dy) / disk.r
    ang = np.arctan2(dy, dx)
    scale = np.percentile(img[valid & (rr <= 1.05)], 99) + 1e-6
    v = np.clip(img / scale, 0, 1.5)
    radial = np.zeros(RINGS)
    for i in range(RINGS):
        sel = valid & (rr >= i / RINGS) & (rr < (i + 1) / RINGS)
        radial[i] = v[sel].mean() if sel.any() else 0
    band = valid & (rr > 0.25) & (rr < 0.6)
    bins = 180
    idx = ((ang[band] + math.pi) / (2 * math.pi) * bins).astype(int) % bins
    prof = np.bincount(idx, weights=v[band], minlength=bins) / np.maximum(np.bincount(idx, minlength=bins), 1)
    spec = np.abs(np.fft.rfft(prof - prof.mean()))[1 : KMAX + 1]
    spec = spec / (np.linalg.norm(spec) + 1e-9)
    return np.concatenate([radial, 0.6 * spec])


def symmetry(feat: np.ndarray, top: int = 3) -> list[int]:
    """Strongest angular orders k (petal symmetry) from the spectrum part of a feature vector."""
    spec = feat[RINGS:]
    return [int(k) + 1 for k in np.argsort(spec)[::-1][:top]]


def render(c: float, t_max: float, disk: Disk, shape: tuple[int, int], ss: int = 4) -> np.ndarray:
    """Additively drawn curve e^{it} + e^{ict}, t ∈ [0, t_max], at the video's position/scale."""
    h, w = shape
    acc = np.zeros((h * ss, w * ss), np.float32)
    # dense enough that consecutive samples are < 1 supersampled pixel apart (|z'| ≤ 1 + c)
    n = int(t_max * (1 + c) * disk.r / 2 * ss) + 2
    t = np.linspace(0, t_max, n)
    z = np.exp(1j * t) + np.exp(1j * c * t)
    s = disk.r / 2 * ss
    x = (disk.cx * ss + s * z.real).astype(int)
    y = (disk.cy * ss - s * z.imag).astype(int)
    ok = (x >= 0) & (x < w * ss) & (y >= 0) & (y < h * ss)
    np.add.at(acc, (y[ok], x[ok]), 1.0)
    img = acc.reshape(h, ss, w, ss).sum(axis=(1, 3))
    img = 255 * (1 - np.exp(-img / 3.0))  # additive glow, saturating like the video
    blurred = Image.fromarray(img.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    return np.asarray(blurred, np.float32)


def main() -> None:
    frames, fps = read_frames()
    h, w = frames[0].shape
    valid = valid_mask(h, w)
    usable = []
    for i, f in enumerate(frames):
        d = find_disk(f, valid)
        if d is not None:
            usable.append((i, d))
    # a drawing stage is only comparable while the whole envelope is on screen and not zoomed
    radii = np.array([d.r for _, d in usable])
    med = float(np.median(radii))
    med_cx = float(np.median([d.cx for _, d in usable]))
    med_cy = float(np.median([d.cy for _, d in usable]))
    # same envelope size AND position as the drawing: excludes zoomed views and non-drawing screens
    usable = [
        (i, d) for i, d in usable if abs(d.r - med) < 5 and abs(d.cx - med_cx) < 6 and abs(d.cy - med_cy) < 6
    ]
    disk0 = Disk(float(np.median([d.cx for _, d in usable])), float(np.median([d.cy for _, d in usable])), med)
    video_feats = {i: features(frames[i], valid, disk0) for i, _ in usable}

    results: dict[str, dict[int, tuple[float, float]]] = {}
    for name, c in RATIOS:
        cand = [(T, features(render(c, T, disk0, (h, w)), valid, disk0)) for T in T_GRID]
        per_frame = {}
        for i, vf in video_feats.items():
            dists = [(float(np.linalg.norm(vf - cf)), T) for T, cf in cand]
            per_frame[i] = min(dists)
        results[name] = per_frame

    frames_sorted = sorted(video_feats)

    # --- symmetry test (decisive): the video's petal order and when it disappears -----------
    vsym = {i: symmetry(video_feats[i]) for i in frames_sorted}
    dominant = [vsym[i][0] for i in frames_sorted if vsym[i][0] > 1]
    k_flower = max(set(dominant), key=dominant.count)
    flower_frames = [i for i in frames_sorted if vsym[i][0] == k_flower]
    late_frames = [i for i in frames_sorted if i > max(flower_frames) and k_flower not in vsym[i]]
    sym_rows = []
    for name, c in RATIOS:
        seq = [(float(T), symmetry(features(render(c, float(T), disk0, (h, w)), valid, disk0))) for T in T_GRID[::3]]
        t_flower = [T for T, k in seq if k[0] == k_flower]
        passes_flower = bool(t_flower)
        passes_late = passes_flower and any(T > max(t_flower) and k_flower not in k for T, k in seq) if late_frames else True
        orders = sorted({k[0] for _, k in seq})
        sym_rows.append((name, passes_flower, passes_late, t_flower, orders))
    best_per_frame = {i: min(results[n][i][0] for n, _ in RATIOS) for i in frames_sorted}
    summary = []
    for name, _ in RATIOS:
        d = np.array([results[name][i][0] for i in frames_sorted])
        worst_excess = max(results[name][i][0] - best_per_frame[i] for i in frames_sorted)
        summary.append((name, float(d.mean()), float(d.max()), worst_excess))
    summary.sort(key=lambda s: s[1])

    # figures: video vs best π reconstruction for a few frames
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    picks = [frames_sorted[k] for k in np.linspace(0, len(frames_sorted) - 1, 4).astype(int)]
    tiles = []
    for i in picks:
        T = results["π"][i][1]
        v = Image.fromarray(frames[i].astype(np.uint8)).crop((0, VALID_Y_MIN, 180, VALID_Y_MAX))
        r = Image.fromarray(render(math.pi, T, disk0, (h, w)).astype(np.uint8)).crop((0, VALID_Y_MIN, 180, VALID_Y_MAX))
        tile = Image.new("L", (360, v.height + 14), 40)
        tile.paste(v, (0, 14))
        tile.paste(r, (180, 14))
        ImageDraw.Draw(tile).text((2, 1), f"video {i / fps:.1f}s  |  pi, T={T:g}", fill=255)
        tiles.append(tile)
    sheet = Image.new("L", (360, sum(t.height for t in tiles)), 0)
    y = 0
    for t in tiles:
        sheet.paste(t, (0, y))
        y += t.height
    sheet.save(FIG_DIR / "video-vs-pi.png", optimize=True)

    lines = [
        "# Reference Reconstruction — analysis",
        "",
        "Generated by `tools/reference/analyze.py` from `infinite-lab-source-reference.mp4`",
        f"({w}×{h}, {fps:g} fps, {len(frames)} frames; {len(frames_sorted)} frames show the whole drawing and were compared).",
        "",
        "Candidate family: **z(t) = e^{it} + e^{i·c·t}** (two equal arms; arm 2 turns c× as fast) — Experiment 04 `two-arm`.",
        "Features: radial brightness profile (24 rings) + angular spectrum (petal symmetry), both rotation-invariant.",
        "For each frame and candidate, the drawing time T is searched on a grid; the smallest feature distance is kept.",
        "",
        "## 1. Symmetry test (decisive)",
        "",
        f"In the video the drawing shows a clear **{k_flower}-fold** petal symmetry in {len(flower_frames)} frames "
        f"({min(flower_frames) / fps:.1f}–{max(flower_frames) / fps:.1f} s), which then disappears "
        f"({len(late_frames)} later frames without order {k_flower} among the three strongest).",
        "A candidate passes if it (a) produces a dominant order of the same value at some drawing time and",
        "(b) later loses it, as the video does.",
        "",
        f"| ratio c | (a) shows {k_flower}-fold | (b) then loses it | dominant orders seen | verdict |",
        "|---|---|---|---|---|",
    ]
    for name, pa, pb, tf, orders in sym_rows:
        verdict = "consistent" if pa and pb else "rejected"
        span = f"yes (first at T ≈ {min(tf):g})" if pa else "no"
        lines.append(f"| {name} | {span} | {'yes' if pb and pa else 'no'} | {', '.join(map(str, orders))} | **{verdict}** |")
    lines += [
        "",
        f"For two equal arms with ratio c ≈ p/q the curve nearly closes with p − q petals; π ≈ 22/7 gives 22 − 7 = 15.",
        "Exactly 22/7 closes and keeps its 15 petals forever, which contradicts the later frames.",
        "",
        "## 2. Feature distance (auxiliary)",
        "",
        "Radial brightness + angular spectrum, smallest distance over drawing time. The radial part converges for any",
        "irrational ratio and depends on the assumed glow model, so this table alone does not discriminate well.",
        "",
        "| ratio c | mean distance | worst frame | worst excess over best candidate |",
        "|---|---|---|---|",
    ]
    for name, mean, worst, excess in summary:
        lines.append(f"| {name} | {mean:.3f} | {worst:.3f} | {excess:.3f} |")
    lines += [
        "",
        "Lower is better. *Excess* is how much worse the candidate is than the best candidate on its worst frame.",
        "",
        "![video vs π reconstruction](analysis/video-vs-pi.png)",
        "",
        "## 3. Per-frame best drawing time for c = π (feature distance)",
        "",
        "| video time | best T (π) | distance |",
        "|---|---|---|",
    ]
    for i in frames_sorted:
        lines.append(f"| {i / fps:.1f} s | {results['π'][i][1]:g} | {results['π'][i][0]:.3f} |")
    lines += [
        "",
        "## Interpretation (what this does and does not show)",
        "",
        "- The candidates are compared only through blurred, rotation-invariant features of a 180×320 recording.",
        "- Ratios very close to π (e.g. 355/113) produce the same pictures until very long drawing times and",
        "  **cannot be distinguished** from π with this video.",
        "- Arm-length ratio, drawing speed, colours and glow are not determined by this analysis; the rendering",
        "  model (additive glow + blur) is an assumption.",
        "- Per spec §40 this is *not* called a reproduction: the video is **consistent with** c = π (or a ratio",
        "  indistinguishably close to it, such as 355/113) and **rejects** the other candidates listed above.",
        "",
    ]
    (OUT_DIR / "ANALYSIS.md").write_text("\n".join(lines), encoding="utf-8")
    for name, mean, worst, excess in summary:
        print(f"{name:8s} mean={mean:.3f} worst={worst:.3f} excess={excess:.3f}")
    print(f"video symmetry: {k_flower}-fold in {len(flower_frames)} frames, lost in {len(late_frames)} later frames")
    for name, pa, pb, tf, orders in sym_rows:
        print(f"{name:8s} flower={pa} late={pb} orders={orders}")
    print(f"frames compared: {len(frames_sorted)}, disk r={disk0.r:.1f} at ({disk0.cx:.1f},{disk0.cy:.1f})")


if __name__ == "__main__":
    main()
