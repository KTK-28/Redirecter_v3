#!/usr/bin/env python3
"""
scripts/fetch_products.py

CLI tool to pull live product catalog from Shopify using GraphQL API
and save it to data/products.json.
"""

import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import auth, catalog_fetcher

if __name__ == "__main__":
    cfg = auth.load_config()
    if not auth.is_configured(cfg):
        print("ERROR: config.json or .env is missing shop / client_id / client_secret.", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching products from {cfg['shop']} ...")
    products = catalog_fetcher.fetch_all_products(cfg)

    os.makedirs("data", exist_ok=True)
    out_path = os.path.join("data", "products.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(products, f, indent=2, ensure_ascii=False)

    print(f"\nDone. Saved {len(products)} products to {out_path}")
