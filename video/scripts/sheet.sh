#!/usr/bin/env bash
# 4 kontrol karesini 2x2 tek görsele birleştirir: scripts/sheet.sh out.png a.png b.png c.png d.png
out=$1; shift
args=(); for f in "$@"; do args+=(-i "$f"); done
while [ $# -lt 4 ]; do args+=(-f lavfi -i "color=c=black:s=960x540:d=1"); set -- "$@" x; done
ffmpeg -y -loglevel error "${args[@]}" -filter_complex "xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0" -frames:v 1 "$out"
