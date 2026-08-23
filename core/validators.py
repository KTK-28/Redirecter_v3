"""
core/validators.py

Request Payload & SSRF Validation for API Endpoints.
Ensures incoming parameters conform to valid types, bounds, and security filters.
"""

import socket
import ipaddress
from urllib.parse import urlparse


class ValidationError(Exception):
    pass


def is_safe_public_url(url, shop_domain=""):
    """
    SSRF Protection: Validates that a URL does not target loopback,
    private network ranges (RFC 1918), or cloud metadata services.
    """
    if not url:
        return False
    parsed = urlparse(url if "://" in url else f"https://{url}")
    hostname = parsed.hostname
    if not hostname:
        return False

    hostname_lower = hostname.lower()
    if hostname_lower in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return False

    try:
        ip_str = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(ip_str)

        if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False

        # Explicitly block AWS IMDS / Cloud Metadata Endpoint
        if str(ip) == "169.254.169.254":
            return False

        return True
    except (socket.gaierror, ValueError):
        # If hostname cannot be resolved, block it for safety
        return False


def validate_set_status_payload(data):
    if not isinstance(data, dict):
        raise ValidationError("Payload must be a JSON object.")
    if "id" not in data or not isinstance(data["id"], int):
        raise ValidationError("Field 'id' is required and must be an integer.")
    if "status" in data and data["status"] not in ("pending", "confirmed", "applied", "skipped", "ignored", "rejected", "error"):
        raise ValidationError(f"Invalid status '{data['status']}'.")
    if "chosen_index" in data and (not isinstance(data["chosen_index"], int) or data["chosen_index"] < 0):
        raise ValidationError("Field 'chosen_index' must be a non-negative integer.")
    if "custom_target" in data and data["custom_target"] is not None:
        if not isinstance(data["custom_target"], str):
            raise ValidationError("Field 'custom_target' must be a string.")
        if len(data["custom_target"]) > 2000:
            raise ValidationError("Field 'custom_target' exceeds max length of 2000 characters.")


def validate_apply_payload(data):
    if not isinstance(data, dict):
        raise ValidationError("Payload must be a JSON object.")
    if "ids" not in data or not isinstance(data["ids"], list):
        raise ValidationError("Field 'ids' is required and must be a list of integers.")
    if len(data["ids"]) > 100:
        raise ValidationError("Maximum batch limit exceeded. Cannot apply more than 100 redirects per request.")
    for row_id in data["ids"]:
        if not isinstance(row_id, int):
            raise ValidationError(f"Invalid id '{row_id}' in ids list. Must be integer.")


def validate_check_statuses_payload(data):
    if not isinstance(data, dict):
        raise ValidationError("Payload must be a JSON object.")
    ids = data.get("ids", [])
    if not isinstance(ids, list):
        raise ValidationError("Field 'ids' must be a list.")
    if len(ids) > 100:
        raise ValidationError("Maximum batch limit exceeded. Cannot check more than 100 URLs per request.")


def validate_instant_payload(data):
    if not isinstance(data, dict):
        raise ValidationError("Payload must be a JSON object.")
    url = (data.get("broken_url") or "").strip()
    if not url:
        raise ValidationError("Field 'broken_url' cannot be empty.")
    if len(url) > 2000:
        raise ValidationError("Field 'broken_url' exceeds max length of 2000 characters.")


def validate_pattern_payload(data):
    if not isinstance(data, dict):
        raise ValidationError("Payload must be a JSON object.")
    from_pat = (data.get("from_pattern") or "").strip()
    to_tmpl = (data.get("to_template") or "").strip()
    if not from_pat:
        raise ValidationError("Field 'from_pattern' is required and cannot be empty.")
    if not to_tmpl:
        raise ValidationError("Field 'to_template' is required and cannot be empty.")
    if len(from_pat) > 500 or len(to_tmpl) > 500:
        raise ValidationError("Pattern strings cannot exceed 500 characters.")


def validate_watchlist_payload(data):
    if not isinstance(data, dict):
        raise ValidationError("Payload must be a JSON object.")
    url = (data.get("url") or "").strip()
    if not url:
        raise ValidationError("Field 'url' is required and cannot be empty.")
    if len(url) > 2000:
        raise ValidationError("Field 'url' exceeds max length of 2000 characters.")


def validate_sitemap_payload(data):
    if not isinstance(data, dict):
        raise ValidationError("Payload must be a JSON object.")
    url = (data.get("sitemap_url") or "").strip()
    if not url:
        raise ValidationError("Field 'sitemap_url' is required.")
    if not is_safe_public_url(url):
        raise ValidationError("Access to restricted, private, or loopback IP address is blocked (SSRF protection).")
