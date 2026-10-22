#!/bin/bash
# Fetch real product images for Torob demo catalog (v2 — capture stdout)
set -u
mkdir -p /home/z/my-project/scripts/imgjson /home/z/my-project/public/products
cd /home/z/my-project/scripts/imgjson

declare -A QUERIES=(
  ["nike-v2k"]="Nike V2K Run black leather sneakers product photo on white background"
  ["nb530"]="New Balance 530 white silver classic retro sneakers product photo"
  ["vans"]="Vans black canvas classic sneakers men product photo white background"
  ["skechers"]="Skechers Max Cushioning white walking sneakers product photo"
  ["duramo"]="Adidas Duramo SL running shoes product photo white background"
  ["asics"]="Asics Gel-Contend running shoes product photo"
  ["puma"]="Puma Smash V2 white leather sneakers product photo"
  ["reebok"]="Reebok Quick Motion white sneakers product photo"
  ["nb9060"]="New Balance 9060 grey sneakers product photo"
  ["kayano"]="Asics Gel-Kayano 14 sneakers product photo"
)

for key in "${!QUERIES[@]}"; do
  ( z-ai image-search -q "${QUERIES[$key]}" --count 3 --gl us --no-rank > "${key}.json" 2>/dev/null ) &
done
wait
echo "--- search done ---"

for key in "${!QUERIES[@]}"; do
  f="${key}.json"
  url=$(python3 -c "
import json
try:
    d=json.load(open('$f'))
    for r in d.get('results',[]):
        u=r.get('original_url','')
        if u: print(u); break
except Exception:
    print('')
")
  if [ -n "$url" ]; then
    curl -sL --max-time 60 "$url" -o "/home/z/my-project/public/products/${key}.jpg"
    sz=$(stat -c%s "/home/z/my-project/public/products/${key}.jpg" 2>/dev/null || echo 0)
    echo "${key}: ${sz} bytes"
  else
    echo "${key}: NO RESULT"
  fi
done
echo "ALL_DONE"
