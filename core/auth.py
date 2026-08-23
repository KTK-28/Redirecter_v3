"""
core/auth.py

Shopify Authentication and Config Management.
Supports loading credentials from .env, config.json, or environment variables.
Supports token encryption at rest using cryptography.fernet.
"""

import json
import os
import time
import base64
import urllib.error
import urllib.request
from urllib.parse import urlencode

try:
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    HAS_FERNET = True
except ImportError:
    HAS_FERNET = False


def _get_fernet_key(cfg):
    if not HAS_FERNET:
        return None
    secret = (cfg.get("client_secret") or "redirector_default_secret_key").encode("utf-8")
    salt = b"redirector_salt_v1"
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
    key = base64.urlsafe_b64encode(kdf.derive(secret))
    return Fernet(key)


def _get_data_path(filename):
    if os.path.exists(os.path.join("data", filename)):
        return os.path.join("data", filename)
    return filename


def _load_dotenv_file():
    env_vars = {}
    if os.path.exists(".env"):
        with open(".env", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_vars[k.strip()] = v.strip().strip("'\"")
    return env_vars


def load_config():
    cfg = {"shop": "", "client_id": "", "client_secret": ""}
    cfg_path = _get_data_path("config.json")
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, encoding="utf-8") as f:
                cfg.update(json.load(f))
        except (json.JSONDecodeError, OSError):
            pass

    dotenv_vars = _load_dotenv_file()
    cfg["shop"] = os.environ.get("SHOPIFY_SHOP", dotenv_vars.get("SHOPIFY_SHOP", cfg.get("shop", "")))
    cfg["client_id"] = os.environ.get("SHOPIFY_CLIENT_ID", dotenv_vars.get("SHOPIFY_CLIENT_ID", cfg.get("client_id", "")))
    cfg["client_secret"] = os.environ.get("SHOPIFY_CLIENT_SECRET", dotenv_vars.get("SHOPIFY_CLIENT_SECRET", cfg.get("client_secret", "")))
    return cfg


def is_configured(cfg):
    return (
        bool(cfg.get("shop")) and bool(cfg.get("client_id")) and bool(cfg.get("client_secret"))
        and "REPLACE" not in cfg.get("client_id", "")
        and "REPLACE" not in cfg.get("client_secret", "")
    )


def _load_cache(cfg):
    cache_path = _get_data_path("token_cache.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as f:
                data = json.load(f)
            if data.get("encrypted") and HAS_FERNET:
                f_obj = _get_fernet_key(cfg)
                decrypted_bytes = f_obj.decrypt(data["raw"].encode("utf-8"))
                return json.loads(decrypted_bytes.decode("utf-8"))
            return data
        except Exception:
            return {}
    return {}


def _save_cache(cfg, cache):
    os.makedirs("data", exist_ok=True)
    cache_path = os.path.join("data", "token_cache.json") if os.path.exists("data") else "token_cache.json"

    if HAS_FERNET:
        try:
            f_obj = _get_fernet_key(cfg)
            raw_json = json.dumps(cache).encode("utf-8")
            encrypted_str = f_obj.encrypt(raw_json).decode("utf-8")
            payload = {"encrypted": True, "raw": encrypted_str}
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            return
        except Exception:
            pass

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)


def _post_token_endpoint(shop, body):
    url = f"https://{shop}/admin/oauth/access_token"
    data = urlencode(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8")
        raise RuntimeError(f"Shopify rejected token request ({e.code}): {detail}")


def _request_new_token(shop, client_id, client_secret):
    data = _post_token_endpoint(shop, {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "client_credentials",
    })
    return data["access_token"], data.get("expires_in", 86400)


def _refresh_with_refresh_token(cfg, refresh_token):
    return _post_token_endpoint(cfg["shop"], {
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })


def get_valid_token(cfg, force_refresh=False):
    """Returns a valid access token, refreshing or requesting one as needed."""
    now = time.time()
    cache = _load_cache(cfg)

    if not force_refresh and cache.get("access_token"):
        expires_at = cache.get("expires_at")
        if expires_at is None or expires_at > now + 120:
            return cache["access_token"]

    if cache.get("refresh_token"):
        data = _refresh_with_refresh_token(cfg, cache["refresh_token"])
        new_cache = {"access_token": data["access_token"]}
        if "expires_in" in data:
            new_cache["expires_at"] = now + data["expires_in"]
        if "refresh_token" in data:
            new_cache["refresh_token"] = data["refresh_token"]
        _save_cache(cfg, new_cache)
        return new_cache["access_token"]

    access_token, expires_in = _request_new_token(
        cfg["shop"], cfg["client_id"], cfg["client_secret"]
    )
    new_cache = {
        "access_token": access_token,
        "expires_at": now + expires_in,
    }
    _save_cache(cfg, new_cache)
    return access_token
