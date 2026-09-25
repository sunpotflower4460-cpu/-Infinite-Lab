# Claude Code project notes

## Visual reference for the infinite-geometry experiment

Before changing the pi/infinite drawing behavior, inspect:

- `docs/reference/pi-infinite-reference.mp4`

This is a lightweight ~50-second reference copy derived from the user-provided screen recording. It is intentionally low resolution so it can live safely in the repository and be inspected during development.

Focus on the evolving geometric motion/patterns created by repeated circle/line construction. Do **not** reproduce the surrounding Instagram/Reels UI; it is not part of the product design.

If your current environment cannot inspect MP4 directly, extract frames first, for example:

```bash
mkdir -p /tmp/pi-infinite-ref
ffmpeg -y -i docs/reference/pi-infinite-reference.mp4 -vf fps=1/5 /tmp/pi-infinite-ref/frame-%02d.png
```

Then inspect the extracted frames as visual references before implementing or reviewing the drawing behavior.
