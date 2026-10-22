#!/bin/bash
# Generate 3 remaining accessory product images (image-search is rate-limited)
set -u
cd /home/z/my-project

z-ai image -p "Professional product photography of a pair of white athletic crew socks, folded neatly, plain light gray background, studio lighting, e-commerce style, high quality" -o "public/products/socks.png" -s 1024x1024
z-ai image -p "Professional product photography of a pair of replacement shoe insoles, one slightly overlapping the other, plain light gray background, studio lighting, e-commerce style, high quality" -o "public/products/insole.png" -s 1024x1024
z-ai image -p "Professional product photography of a coiled pair of round sneaker shoelaces, white with subtle texture, plain light gray background, studio lighting, e-commerce style, high quality" -o "public/products/laces.png" -s 1024x1024

echo "--- converting to jpg ---"
for n in socks insole laces; do
  if [ -f "public/products/$n.png" ]; then
    python3 -c "
from PIL import Image
im = Image.open('public/products/$n.png').convert('RGB')
im.save('public/products/$n.jpg', 'JPEG', quality=88)
print('$n.jpg ok', im.size)
"
  else
    echo "$n.png MISSING"
  fi
done
ls -la public/products/
