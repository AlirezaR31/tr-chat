#!/bin/bash
# Retry remaining 3 accessory images with long cooldown between calls
set -u
cd /home/z/my-project

fetch() {
  local name=$1; shift
  local query=$1; shift
  for attempt in 1 2 3 4; do
    z-ai image-search -q "$query" -c 2 --gl us --no-rank -o "/tmp/img_$name.json" >/dev/null 2>&1
    if [ -s "/tmp/img_$name.json" ]; then
      echo "$name: OK (attempt $attempt)"
      return 0
    fi
    echo "$name: attempt $attempt failed; cooldown 45s"
    sleep 45
  done
  echo "$name: FAILED"
}

sleep 60
fetch socks "white athletic sports socks pair product photo on plain background"
sleep 30
fetch insole "shoe insoles replacement pair product photo on plain background"
sleep 30
fetch laces "sneaker shoelaces pair product photo on plain background"

echo "--- final ---"
for f in socks insole laces; do
  [ -s "/tmp/img_$f.json" ] && echo "$f: OK" || echo "$f: MISSING"
done
