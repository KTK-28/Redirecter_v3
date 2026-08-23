# Redirector — Shopify Broken Link & 301 Redirect Automation Suite

**Redirector** is an automated, high-performance web application and CLI toolkit designed to detect 404 broken URLs, intelligently match them against active Shopify store products using fuzzy logic and pattern rules, verify live HTTP page statuses, and create 301 redirects directly on Shopify with 1 click.

---

## 🌟 Key Features

### 1. 📁 Instant File Uploader (.xlsx / .csv / .txt) & Paste Bar
- **File Upload**: Upload broken link reports directly from the web interface (`.xlsx`, `.xls`, `.csv`, `.txt`).
- **Smart Column Auto-Detection**: Automatically finds URL columns (e.g., `Broken URL`, `URL`, `Link`, `Path`, `404`) or parses raw rows.
- **Instant Fix Bar**: Paste any single broken URL to resolve and match it immediately.

### 2. 🧠 Intelligent Match Engine & Wildcard Pattern Rules
- **Dual Matching System**:
  - **Fuzzy Catalog Matcher**: Extracts product candidate names from URL slugs and scores them against product titles and handles using SequenceMatcher ratio and token overlap.
  - **Pattern Rule Engine**: Defines wildcard rules (e.g. `/collections/old-*` $\rightarrow$ `/collections/summer-2026/$1`) to automatically resolve entire categories of URLs in one rule.
- **Alternate Candidate Selector**: Presents top matching candidate products with confidence percentages, allowing you to select alternate product candidates with a single click.

### 3. 🎯 Custom Target URL Assignment
- Assign custom target URLs (e.g. `/collections/all`, `/pages/contact`, `/`, or external links) on any card when none of the catalog candidate products match.
- Custom target URLs override candidate matches and are created directly on Shopify when applied.

### 4. ⚡ Live HTTP Status Checker (200 OK / 404 Not Found Probes)
- **Parallel Probing**: Sends HEAD requests live against your storefront using 10 worker threads.
- **Visual Badges**:
  - `🟢 200 OK (Live)`: Highlights active live pages.
  - `🔴 404 Not Found`: Confirms genuinely broken 404 URLs.
  - `🟡 301 Redirect`: Detects existing active redirects.
- **Don't Redirect Guard**: Includes an explicit **Don't Redirect** button on cards to set status to `ignored` so active live pages are never bulk-overwritten.

### 5. ⏱️ 15-Second Live 301 Redirect Verification
- Automatically probes storefront URLs 15 seconds after applying redirects to verify that Shopify activated the 301 redirect live.
- Updates card status to **`Verified Live 301 ✓`**.

### 6. 📥 Single Unified Export Control (Excel & CSV)
- Consolidated export toolbar with a format selector (**`Excel (.xlsx)`** vs **`CSV (.csv)`**) and scope selector (**`all rows`**, **`applied only`**, **`confirmed only`**, **`pending only`**, **`ignored only`**).
- Single-click download for Shopify import or audit records.

### 7. 📊 Analytics Dashboard & 404 Watchlist Automation
- **Dashboard (`/dashboard`)**: Key metric KPIs, status breakdown progress bars, confidence score distribution buckets, and searchable issue table.
- **Automation (`/automation`)**: Wildcard pattern rules manager, sitemap.xml auto-importer, and background 404 Watchlist scanner.

### 8. 💻 1-Click Windows Portable Launcher (`start.bat`)
- Complete setup script that checks Python, creates virtual environment (`.venv`), installs required dependencies, launches the server, and opens your browser to `http://localhost:5000` automatically.

### 9. 🔄 Glassmorphism Animated Loader Overlay
- Provides visual feedback with a glowing spinner overlay for file uploads, rescans, HTTP checks, and bulk redirect creation calls.

---

## 🏗️ Project Architecture & Directory Structure

```text
V3/
├── app.py                  # Main Flask application entrypoint & API endpoints
├── start.bat               # 1-Click portable Windows launcher
├── requirements.txt        # Python dependencies
├── .env.example            # Environment configuration template
├── .env                    # Local credentials file (git-ignored)
├── README.md               # Project documentation
│
├── core/                   # Python Business Logic Package
│   ├── __init__.py         # Package initializer
│   ├── auth.py             # Shopify authentication & token management
│   ├── matcher.py          # Fuzzy matching algorithm & pattern rule engine
│   ├── live_checker.py     # Multi-threaded HTTP status probing (HEAD requests)
│   └── catalog_fetcher.py  # Shopify GraphQL API product catalog sync
│
├── templates/              # HTML Page Templates (Jinja2)
│   ├── base.html           # Master layout with nav header & loader overlay
│   ├── review.html         # Main Review & Apply page
│   ├── dashboard.html      # Metrics & KPI breakdown dashboard
│   └── automation.html     # Pattern rules & 404 Watchlist page
│
├── static/                 # Static Web Assets
│   ├── favicon.svg         # SVG Favicon icon
│   ├── css/
│   │   └── style.css       # Dark theme design system stylesheet
│   └── js/
│       ├── review.js       # Review page logic & loader integration
│       ├── dashboard.js    # Dashboard KPIs & charts
│       └── automation.js   # Pattern rules & watchlist handlers
│
├── data/                   # Persistent Data Storage
│   ├── config.json         # Store domain & app credentials
│   ├── matches.json        # Saved matches database (all broken links & statuses)
│   ├── products.json       # Cached Shopify product catalog
│   ├── patterns.json       # Saved wildcard pattern rules
│   ├── watchlist.json      # Watched URLs list
│   └── token_cache.json    # Cached OAuth access tokens
│
└── scripts/                # Standalone CLI Helper Scripts
    ├── authorize.py        # OAuth authorization setup script
    ├── fetch_products.py   # CLI catalog sync script
    └── match_links.py      # CLI batch match processing script
```

---

## 🚀 Quick Start Guide

### Step 1: Prerequisites
- Installed **Python 3.9** or higher on your system.

### Step 2: Configure Credentials
Create or edit `data/config.json` (or `.env` in the root directory) with your Shopify store details:

```json
{
  "shop": "yourstore.myshopify.com",
  "client_id": "YOUR_SHOPIFY_CLIENT_ID",
  "client_secret": "YOUR_SHOPIFY_CLIENT_SECRET"
}
```

### Step 3: Run Application

#### On Windows:
Double-click **`start.bat`**. The launcher will automatically:
1. Check Python.
2. Create `.venv` virtual environment if missing.
3. Install dependencies from `requirements.txt`.
4. Launch the application server.
5. Open **`http://localhost:5000`** in your browser.

#### On macOS / Linux:
Run the following commands in terminal:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
Then open **`http://localhost:5000`** in your web browser.

---

## 📖 Detailed Workflows & User Guide

### 1. Review & Apply Broken Links (`/`)
- **Uploading Broken Files**:
  - Click `📁 Upload Broken Links File (.xlsx / .csv)` in the top bar.
  - Select your spreadsheet. The application extracts broken URLs, runs auto-matching against your catalog and pattern rules, and populates your review list.
- **Reviewing Suggested Matches**:
  - Each card displays the broken URL alongside the suggested match, image thumbnail, and confidence score.
  - Use the dropdown below the match to switch between alternate candidate products.
- **Setting Custom Target URLs**:
  - Click `➕ Custom Target URL` on any card to enter a custom target path (e.g. `/collections/clearance` or `/pages/contact`).
  - Click `Save` (or press Enter). The card locks onto your custom target URL.
- **Checking Live HTTP Statuses**:
  - Click `⚡ Check HTTP (200/404)` in the toolbar.
  - Green `🟢 200 OK` badges indicate live pages. Click `Don't Redirect` on live pages to keep them active.
  - Red `🔴 404 Not Found` badges confirm broken links.
- **Applying Redirects to Shopify**:
  - Click `Apply now` on an individual card, or click `Confirm` on multiple rows and click `Apply all confirmed to Shopify`.
  - The application calls Shopify's REST Redirect API (`POST /admin/api/2024-10/redirects.json`), creates the live 301 redirect, and verifies live execution after 15 seconds.

### 2. Exporting Data
- Select your desired scope from the dropdown (`Export: all rows`, `applied only`, `confirmed only`, `pending only`, `ignored only`).
- Select your format (`Excel (.xlsx)` or `CSV (.csv)`).
- Click **`📥 Download`**.

### 3. Dashboard (`/dashboard`)
- Displays real-time KPIs: Total broken links, Fixed & live count, Confirmed count, Pending review count, Error count, and Average confidence score.
- Visual status breakdown bars and confidence distribution buckets.
- Searchable and filterable issue table.

### 4. Automation & 404 Watchlist (`/automation`)
- **Pattern Rules**: Create wildcard transformation rules (e.g. `/old-catalog/*` $\rightarrow$ `/new-catalog/$1`). Pattern rules take precedence over fuzzy matching.
- **404 Watchlist**: Add URLs or import your store's `sitemap.xml` for background monitoring. The background scanner checks watchlist URLs every hour and queues any new 404s for auto-matching.

---

## 🔌 API Endpoints Summary

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Renders Review & Apply main page (`review.html`) |
| `/dashboard` | `GET` | Renders Analytics Dashboard (`dashboard.html`) |
| `/automation` | `GET` | Renders Pattern Rules & Watchlist page (`automation.html`) |
| `/api/state` | `GET` | Returns matches list, shop domain, and configuration status |
| `/api/set_status` | `POST` | Updates row status, chosen match index, or custom target URL |
| `/api/apply_one` | `POST` | Creates live 301 redirect on Shopify for a single row |
| `/api/apply` | `POST` | Bulk-creates live 301 redirects on Shopify for confirmed rows |
| `/api/upload_broken_links` | `POST` | Parses uploaded `.xlsx`, `.xls`, `.csv`, or `.txt` file |
| `/api/instant` | `POST` | Processes a single pasted broken URL instantly |
| `/api/check_statuses` | `POST` | Sends parallel HEAD requests to verify live 200/404/301 status |
| `/api/rematch` | `POST` | Reruns matching logic (with optional Shopify catalog refetch) |
| `/api/kpis` | `GET` | Returns metrics, status distribution, and score buckets |
| `/api/patterns` | `GET / POST` | Lists or creates pattern rules |
| `/api/patterns/<id>` | `DELETE` | Deletes a pattern rule |
| `/api/watchlist` | `GET / POST` | Lists or adds watchlist URLs |
| `/api/watchlist/import_sitemap` | `POST` | Imports URLs from a `sitemap.xml` URL |
| `/api/watchlist/scan_now` | `POST` | Triggers immediate watchlist 404 scan |
| `/api/export.csv` | `GET` | Downloads report in CSV format |
| `/api/export.xlsx` | `GET` | Downloads report in Excel format |

---

## 🛠️ CLI Helper Scripts

The `scripts/` directory contains standalone command-line tools:

1. **OAuth Setup**:
   ```bash
   python scripts/authorize.py
   ```
   Opens browser consent screen and saves access token to `data/token_cache.json`.

2. **Catalog Sync**:
   ```bash
   python scripts/fetch_products.py
   ```
   Syncs active products from Shopify GraphQL API and saves to `data/products.json`.

3. **Offline Batch Matcher**:
   ```bash
   python scripts/match_links.py data/broken_links.csv
   ```
   Processes a CSV file offline and outputs `data/matches.json`.

---

## 📄 Dependencies

- **Flask**: Web framework
- **requests**: HTTP client library
- **openpyxl**: Excel file generation and parsing (`.xlsx`)
- **python-dotenv**: Environment configuration loader

Install all dependencies using:
```bash
pip install -r requirements.txt
```

---

## 🔒 Security & Data Integrity
- State-changing API routes (`POST`, `DELETE`) require a valid session `X-App-Secret` token header generated on server start.
- Rates between bulk Shopify API calls are throttled to 0.5s per request to remain safely within Shopify REST API rate limits.
