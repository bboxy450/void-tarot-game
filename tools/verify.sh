#!/bin/sh
# Plays the campaign with the scripted player, then checks every recorded trace
# against its Den model. DEN is the bboxy450-den binary.
set -e
cd "$(dirname "$0")/.."
DEN=${DEN:-bboxy450-den}
SPECS=${SPECS:-.bboxy/specs/design}
OUT=${OUT:-/tmp/vtg-traces}
node tools/playthrough.js "$OUT" "${SEED:-1}"
"$DEN" check "$SPECS"
for m in journey chapter encounter trick numeric surface character spread correspondences; do
  "$DEN" replay "$SPECS/$m.den" "$OUT"/$m.*.trace
  echo "replay $m: $(ls "$OUT"/$m.*.trace | wc -l | tr -d ' ') trace(s) conform"
done
