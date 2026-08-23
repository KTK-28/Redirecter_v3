#!/usr/bin/env python3
"""
scripts/match_links.py

CLI tool for offline matching of broken link CSV files against data/products.json catalog.
"""

import os
import sys
import csv
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import matcher


def load_products():
    path = os.path.join("data", "products.json")
    if not os.path.exists(path):
        path = "products.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_broken_links(csv_path):
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = list(csv.reader(f))
    if not reader:
        return []
    links = []
    for row in reader:
        for cell in row:
            val = str(cell or "").strip()
            if val and (val.startswith("http") or val.startswith("/") or ".com/" in val):
                links.append(val)
                break
    return links


if __name__ == "__main__":
    if len(sys.argv) < 2:
        csv_file = os.path.join("data", "broken_links.csv")
        if not os.path.exists(csv_file):
            print("Usage: python scripts/match_links.py <path_to_broken_links.csv>")
            sys.exit(1)
    else:
        csv_file = sys.argv[1]

    products = load_products()
    links = load_broken_links(csv_file)
    print(f"Loaded {len(products)} products and {len(links)} broken links from {csv_file}.")

    results = []
    for idx, link in enumerate(links):
        matches = matcher.resolve_matches_for_url(link, products)
        results.append({
            "id": idx,
            "broken_url": link,
            "extracted_name": matcher.extract_candidate_name(link),
            "matches": matches,
            "status": "pending",
            "chosen_index": 0,
        })

    os.makedirs("data", exist_ok=True)
    out_file = os.path.join("data", "matches.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"Done! Processed {len(results)} matches into {out_file}")