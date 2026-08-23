#!/usr/bin/env python3
"""
scripts/authorize.py

One-time setup: authorizes this app on your store using Shopify's
authorization code grant. Saves access token to data/token_cache.json.
"""

import os
import sys
import json
import time
import secrets
import threading
import webbrowser
import urllib.request
import urllib.error
from urllib.parse import urlencode

# Add parent directory to sys.path to access core package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, request as flask_request
from core import auth

CFG = auth.load_config()
SHOP = CFG["shop"]
CLIENT_ID = CFG["client_id"]
CLIENT_SECRET = CFG["client_secret"]
SCOPES = "read_products,write_content"
REDIRECT_URI = "http://localhost:8765/callback"

STATE = secrets.token_hex(16)

app = Flask(__name__)


@app.route("/")
def start():
    authorize_url = f"https://{SHOP}/admin/oauth/authorize?" + urlencode({
        "client_id": CLIENT_ID,
        "scope": SCOPES,
        "redirect_uri": REDIRECT_URI,
        "state": STATE,
    })
    return f'<meta http-equiv="refresh" content="0; url={authorize_url}">Redirecting to Shopify...'


def exchange_code_for_token(code):
    url = f"https://{SHOP}/admin/oauth/access_token"
    body = urlencode({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Shopify rejected the code exchange ({e.code}): {e.read().decode('utf-8')}")


@app.route("/callback")
def callback():
    returned_state = flask_request.args.get("state")
    code = flask_request.args.get("code")

    if returned_state != STATE:
        return "State mismatch (possible CSRF) — close this window and run authorize.py again.", 400
    if not code:
        return "No authorization code received from Shopify — close this window and try again.", 400

    try:
        token_data = exchange_code_for_token(code)
    except Exception as e:
        return f"Token exchange failed: {e}", 500

    cache = {"access_token": token_data["access_token"]}
    if "expires_in" in token_data:
        cache["expires_at"] = time.time() + token_data["expires_in"]
    if "refresh_token" in token_data:
        cache["refresh_token"] = token_data["refresh_token"]

    auth._save_cache(CFG, cache)

    threading.Thread(target=_shutdown_soon, daemon=True).start()
    return (
        "<h2>Connected!</h2>"
        "<p>Your store is now connected. You can close this tab and return to the application.</p>"
    )


def _shutdown_soon():
    time.sleep(1.5)
    os._exit(0)


if __name__ == "__main__":
    if not CLIENT_ID or not CLIENT_SECRET or not SHOP or "REPLACE" in CLIENT_ID or "REPLACE" in CLIENT_SECRET:
        print("ERROR: fill in shop, client_id, and client_secret in config.json first.")
        raise SystemExit(1)

    print("Opening your browser to authorize this app on your store...")
    print("If it doesn't open automatically, visit: http://localhost:8765")
    threading.Timer(1.0, lambda: webbrowser.open("http://localhost:8765")).start()
    app.run(host="localhost", port=8765, debug=False)