"""
core/catalog_fetcher.py

Fetches active product catalog from Shopify GraphQL Admin API.
"""

import sys
import json
import time
import urllib.request
import urllib.error

from core import auth


QUERY = """
query GetProducts($cursor: String) {
  products(first: 100, after: $cursor, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        title
        handle
        productType
        tags
        onlineStoreUrl
        featuredImage {
          url
          altText
        }
      }
    }
  }
}
"""


def graphql_request(cfg, query, variables=None, _retry=True):
    shop = cfg["shop"]
    api_version = "2024-10"
    url = f"https://{shop}/admin/api/{api_version}/graphql.json"
    token = auth.get_valid_token(cfg)
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401 and _retry:
            auth.get_valid_token(cfg, force_refresh=True)
            return graphql_request(cfg, query, variables, _retry=False)
        print(f"HTTP error {e.code}: {e.read().decode('utf-8')}", file=sys.stderr)
        raise
    except urllib.error.URLError as e:
        print(f"Connection error: {e.reason}", file=sys.stderr)
        raise


def fetch_all_products(cfg):
    shop = cfg["shop"]
    products = []
    cursor = None
    page = 1
    while True:
        data = graphql_request(cfg, QUERY, {"cursor": cursor})
        if "errors" in data:
            raise RuntimeError(f"GraphQL errors: {json.dumps(data['errors'])}")

        block = data["data"]["products"]
        for edge in block["edges"]:
            node = edge["node"]
            url = node.get("onlineStoreUrl")
            if not url:
                url = f"https://{shop.replace('.myshopify.com', '')}.myshopify.com/products/{node['handle']}"
            image = node.get("featuredImage") or {}
            products.append({
                "id": node["id"],
                "title": node["title"],
                "handle": node["handle"],
                "url": url,
                "product_type": node.get("productType", ""),
                "tags": node.get("tags", []),
                "image_url": image.get("url", ""),
            })

        print(f"Fetched page {page} ({len(block['edges'])} products) — total so far: {len(products)}")
        page += 1

        if block["pageInfo"]["hasNextPage"]:
            cursor = block["pageInfo"]["endCursor"]
            time.sleep(0.5)
        else:
            break

    return products
