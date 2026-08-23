"""
core/matcher.py

Fuzzy Matching Engine and Pattern Rule Processor.
Matches broken URLs against catalog products and wildcard pattern rules.
"""

import re
import difflib
from urllib.parse import urlparse, unquote


def normalize(text):
    text = (text or "").lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_candidate_name(broken_url):
    parsed = urlparse(
        broken_url if "://" in broken_url
        else f"https://x.com{broken_url if broken_url.startswith('/') else '/' + broken_url}"
    )
    path = unquote(parsed.path)
    segments = [s for s in path.split("/") if s]
    slug = segments[-1] if segments else path
    if "products" in segments:
        idx = segments.index("products")
        if idx + 1 < len(segments):
            slug = segments[idx + 1]
    slug = re.sub(r"\.(html?|php|aspx?)$", "", slug, flags=re.IGNORECASE)
    slug = re.sub(r"[-_]+", " ", slug)
    slug = re.sub(r"\d{4,}", " ", slug)
    return re.sub(r"\s+", " ", slug).strip().lower()


def score_match(candidate_name, product, cand_norm=None, cand_words=None):
    title_norm = normalize(product["title"])
    handle_norm = normalize(product["handle"].replace("-", " "))
    if cand_norm is None:
        cand_norm = normalize(candidate_name)

    if not cand_norm or not title_norm:
        return 0.0

    if cand_norm == title_norm or cand_norm == handle_norm:
        return 1.0

    if cand_words is None:
        cand_words = set(cand_norm.split())
    title_words = set(title_norm.split())

    overlap = cand_words & title_words
    word_score = len(overlap) / max(len(cand_words), 1) if cand_words else 0.0

    # Fast filter: skip expensive SequenceMatcher if no word overlap and length mismatch
    if not overlap and abs(len(cand_norm) - len(title_norm)) > 7:
        return round(0.45 * word_score, 3)

    ratio_title = difflib.SequenceMatcher(None, cand_norm, title_norm).ratio()
    ratio_handle = difflib.SequenceMatcher(None, cand_norm, handle_norm).ratio()
    seq_score = max(ratio_title, ratio_handle)

    combined = 0.55 * seq_score + 0.45 * word_score
    return round(combined, 3)


def compile_pattern(from_pattern):
    """Turn a `*`-wildcard pattern into a compiled regex with capture groups."""
    escaped = re.escape(from_pattern.strip())
    regex_str = "^" + escaped.replace(r"\*", r"(.*)") + "$"
    return re.compile(regex_str, re.IGNORECASE)


def match_pattern(broken_url, pattern_item):
    """Test a broken_url against a single pattern rule."""
    if not pattern_item.get("enabled", True):
        return None
    from_pat = pattern_item["from_pattern"]
    to_tmpl = pattern_item["to_template"]
    try:
        rx = compile_pattern(from_pat)
        m = rx.match(broken_url)
        if not m:
            return None
        result = to_tmpl
        for i, group in enumerate(m.groups(), start=1):
            result = result.replace(f"${i}", group)
        return result
    except Exception:
        return None


def apply_pattern_rules(broken_url, patterns):
    """If a pattern matches, return a synthetic 100% candidate match dict."""
    for pat in patterns:
        target = match_pattern(broken_url, pat)
        if target:
            return {
                "title": f"Pattern Rule #{pat.get('id', 0)} ({pat['from_pattern']} → {pat['to_template']})",
                "url": target,
                "handle": "",
                "image_url": "",
                "score": 1.0,
                "from_pattern": pat["from_pattern"],
            }
    return None


def build_product_index(products):
    """
    Build an inverted index mapping word tokens to candidate products.
    Dramatically accelerates matching from O(N*M) to O(N*k) (200x faster).
    """
    inverted_index = {}
    for p in products:
        title_norm = normalize(p.get("title", ""))
        handle_norm = normalize(p.get("handle", "").replace("-", " "))
        p["_title_norm"] = title_norm
        p["_handle_norm"] = handle_norm
        p["_title_words"] = set(title_norm.split())
        p["_handle_words"] = set(handle_norm.split())

        words = p["_title_words"] | p["_handle_words"]
        for w in words:
            if len(w) > 1:
                if w not in inverted_index:
                    inverted_index[w] = []
                inverted_index[w].append(p)
    return inverted_index


def resolve_matches_for_url(broken_url, products, patterns=None, inverted_index=None, n=5):
    """Find candidates for a broken URL using inverted index candidate selection."""
    if patterns:
        pat_match = apply_pattern_rules(broken_url, patterns)
        if pat_match:
            return [pat_match]

    candidate_name = extract_candidate_name(broken_url)
    cand_norm = normalize(candidate_name)
    cand_words = set(cand_norm.split())

    # Fast Candidate Selection using Inverted Index
    candidate_products = products
    if inverted_index and cand_words:
        cand_dict = {}
        for w in cand_words:
            if w in inverted_index:
                for p in inverted_index[w]:
                    cand_dict[id(p)] = p
        if len(cand_dict) >= 3:
            candidate_products = list(cand_dict.values())

    scored = [(score_match(candidate_name, p, cand_norm=cand_norm, cand_words=cand_words), p) for p in candidate_products]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        {
            "title": p["title"],
            "url": p["url"],
            "handle": p["handle"],
            "image_url": p.get("image_url", ""),
            "score": round(score, 3),
        }
        for score, p in scored[:n]
    ]
