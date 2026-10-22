#!/bin/bash
# Sequential image fetch with delays to avoid 429
set -u
cd /home/z/my-project

fetch() {
  local name=$1; shift
  local query=$1; shift
  for attempt in 1 2 3; do
    z-ai image-search -q "$query" -c 2 --gl us --no-rank -o "/tmp/img_$name.json" >/dev/null 2>&1
    if [ -s "/tmp/img_$name.json" ]; then
      echo "$name: OK (attempt $attempt)"
      return 0
    fi
    echo "$name: retry $attempt failed, sleeping 20s"
    sleep 20
  done
  echo "$name: FAILED"
}

fetch care "sneaker cleaning kit brush bottle product photo"
sleep 15
fetch bag "black sports gym duffel bag product photo on plain background"
sleep 15
fetch socks "white athletic sports socks pair product photo on plain background"
sleep 15
fetch insole "shoe insoles replacement pair product photo on plain background"
sleep 15
fetch laces "sneaker shoelaces pair product photo on plain background"

echo "--- final ---"
for f in care bag socks insole laces; do
  [ -s "/tmp/img_$f.json" ] && echo "$f: OK" || echo "$f: MISSING"
done
