#!/bin/bash
# Fetch 5 accessory product images in parallel via z-ai image-search
set -u
cd /home/z/my-project

z-ai image-search -q "white athletic sports socks pair product photo on plain background" -c 2 --gl us --no-rank -o /tmp/img_socks.json &
P1=$!
z-ai image-search -q "shoe insoles replacement pair product photo on plain background" -c 2 --gl us --no-rank -o /tmp/img_insole.json &
P2=$!
z-ai image-search -q "sneaker shoelaces pair product photo on plain background" -c 2 --gl us --no-rank -o /tmp/img_laces.json &
P3=$!
z-ai image-search -q "sneaker cleaning kit brush bottle product photo" -c 2 --gl us --no-rank -o /tmp/img_care.json &
P4=$!
z-ai image-search -q "black sports gym duffel bag product photo on plain background" -c 2 --gl us --no-rank -o /tmp/img_bag.json &
P5=$!

wait $P1 $P2 $P3 $P4 $P5
echo "--- results ---"
for f in socks insole laces care bag; do
  if [ -s "/tmp/img_$f.json" ]; then
    echo "$f: OK ($(wc -c < /tmp/img_$f.json) bytes)"
  else
    echo "$f: MISSING"
  fi
done
