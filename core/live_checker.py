"""
core/live_checker.py

Live HTTP Status Probing for URLs (200 OK, 404 Not Found, 301 Redirect)
with SSRF Protection and 429 Rate-Limit Exponential Backoff Retries.
"""

import time
import urllib.request
import urllib.error

from core import validators


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check_live_url_status(url, shop="", timeout=6, max_retries=3):
    """
    Check live HTTP status code of a URL (200 OK, 404 Not Found, 301 Redirect).
    Includes automatic exponential backoff retry for HTTP 429 Rate Limiting.
    """
    full_url = url
    shop_domain = shop if shop else "x.com"
    if not full_url.startswith("http"):
        full_url = f"https://{shop_domain}{url if url.startswith('/') else '/' + url}"

    # SSRF Protection: Validate target URL before making outbound connection
    if not validators.is_safe_public_url(full_url, shop_domain=shop):
        return 0, "Blocked (SSRF protection)"

    opener = urllib.request.build_opener(NoRedirectHandler)

    for attempt in range(max_retries + 1):
        method = "HEAD" if attempt == 0 else "GET"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        if method == "GET":
            headers["Range"] = "bytes=0-100"

        req = urllib.request.Request(full_url, method=method, headers=headers)

        try:
            with opener.open(req, timeout=timeout) as resp:
                return resp.status, "200 OK"
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 307, 308):
                return e.code, f"Redirect ({e.code})"
            elif e.code == 404:
                return 404, "404 Not Found"
            elif e.code == 429:
                if attempt < max_retries:
                    retry_after = e.headers.get("Retry-After")
                    sleep_time = float(retry_after) + 0.5 if (retry_after and retry_after.replace('.', '', 1).isdigit()) else (1.5 * (attempt + 1))
                    time.sleep(sleep_time)
                    continue
                return 429, "429 Rate Limited"
            return e.code, f"HTTP {e.code}"
        except Exception as e:
            if attempt < max_retries:
                time.sleep(1.0)
                continue
            return 0, f"Error ({e})"

    return 429, "429 Rate Limited"


def check_url_status(url, shop="", timeout=8):
    """Returns the HTTP status code for a URL, or None if unreachable."""
    code, _ = check_live_url_status(url, shop=shop, timeout=timeout)
    return code if code != 0 else None
