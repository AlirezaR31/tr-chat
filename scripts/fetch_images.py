#!/usr/bin/env python3
"""Fetch product images for the Torob demo catalog (sequential, reliable)."""
import json
import subprocess
import urllib.request
from pathlib import Path

QUERY_FILE = Path("/home/z/my-project/scripts/queries.json")
OUT_DIR = Path("/home/z/my-project/public/products")
JSON_DIR = Path("/home/z/my-project/scripts/imgjson")
OUT_DIR.mkdir(parents=True, exist_ok=True)
JSON_DIR.mkdir(parents=True, exist_ok=True)

QUERIES = {
    "nike-v2k": "Nike V2K Run black leather sneakers product photo on white background",
    "nb530": "New Balance 530 white silver classic retro sneakers product photo",
    "vans": "Vans black canvas classic sneakers men product photo white background",
    "skechers": "Skechers Max Cushioning white walking sneakers product photo",
    "duramo": "Adidas Duramo SL running shoes product photo white background",
    "asics": "Asics Gel-Contend running shoes product photo",
    "puma": "Puma Smash V2 white leather sneakers product photo",
    "reebok": "Reebok Quick Motion white sneakers product photo",
    "nb9060": "New Balance 9060 grey sneakers product photo",
    "kayano": "Asics Gel-Kayano 14 sneakers product photo",
}


def search(key: str, query: str) -> str | None:
    out = JSON_DIR / f"{key}.json"
    if out.exists() and out.stat().st_size > 200:
        pass  # reuse
    else:
        subprocess.run(
            ["z-ai", "image-search", "-q", query, "--count", "3", "--gl", "us", "--no-rank"],
            stdout=open(out, "w"),
            stderr=subprocess.DEVNULL,
            timeout=180,
        )
    try:
        text = out.read_text()
        # strip CLI log lines before the JSON body
        idx = text.find("{")
        data = json.loads(text[idx:])
        for r in data.get("results", []):
            u = r.get("original_url", "")
            if u:
                return u
    except Exception as e:
        print(f"{key}: parse error {e}")
    return None


def download(url: str, dest: Path) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as f:
            f.write(resp.read())
        return dest.stat().st_size > 5000
    except Exception as e:
        print(f"  download failed: {e}")
        return False


def main():
    for key, q in QUERIES.items():
        dest = OUT_DIR / f"{key}.jpg"
        if dest.exists() and dest.stat().st_size > 5000:
            print(f"{key}: exists ({dest.stat().st_size}b)")
            continue
        url = search(key, q)
        if not url:
            print(f"{key}: NO RESULT")
            continue
        ok = download(url, dest)
        print(f"{key}: {'OK ' + str(dest.stat().st_size) + 'b' if ok else 'FAILED'} <- {url[:70]}")


if __name__ == "__main__":
    main()
