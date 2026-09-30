#!/usr/bin/env bash
# Turn the recording from scripts/record-demo.mjs into docs/demo.gif.
#
# The recording is trimmed to the demo, cropped to the workspace (the page
# header, the cube, the sticker map and the playback line - not the sidebar),
# and played back 1.6x faster than it was recorded: the app's "brisk" speed
# reads well live but makes a twenty-move solution run long for a README.
#
#   OUT=demo-out node scripts/record-demo.mjs
#   OUT=demo-out scripts/make-demo-gif.sh
#
# Needs ffmpeg on PATH, or FFMPEG pointing at one.
set -euo pipefail

OUT="${OUT:-demo-out}"
FFMPEG="${FFMPEG:-ffmpeg}"
DEST="${DEST:-docs/demo.gif}"
SPEED="${SPEED:-1.6}"
FPS="${FPS:-12}"
WIDTH="${WIDTH:-720}"
COLORS="${COLORS:-64}"

start=$(node -e "console.log(require('./$OUT/demo.json').start)")
duration=$(node -e "const d=require('./$OUT/demo.json'); console.log((d.end-d.start).toFixed(2))")

filters="crop=1032:698:248:0,setpts=PTS/${SPEED},fps=${FPS},scale=${WIDTH}:-1:flags=lanczos"

"$FFMPEG" -loglevel error -y -ss "$start" -t "$duration" -i "$OUT/demo.webm" \
  -vf "${filters},palettegen=max_colors=${COLORS}:stats_mode=diff" "$OUT/palette.png"
"$FFMPEG" -loglevel error -y -ss "$start" -t "$duration" -i "$OUT/demo.webm" -i "$OUT/palette.png" \
  -lavfi "${filters}[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "$DEST"

ls -la "$DEST"
