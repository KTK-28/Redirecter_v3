/* Redirector - Automation & Watchlist JS Logic */
function authHeaders() {
  return { 'Content-Type': 'application/json', 'X-App-Secret': window.APP_SECRET };
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function addPattern() {
  const f = document.getElementById('pat-from').value.trim();
  const t = document.getElementById('pat-to').value.trim();
  if (!f || !t) return;
  await fetch('/api/patterns', { method:'POST', headers: authHeaders(), body: JSON.stringify({from_pattern:f, to_template:t}) });
  document.getElementById('pat-from').value = '';
  document.getElementById('pat-to').value = '';
  loadPatterns();
}

async function togglePattern(id) {
  await fetch(`/api/patterns/${id}/toggle`, { method:'POST', headers: authHeaders() });
  loadPatterns();
}

async function deletePattern(id) {
  await fetch(`/api/patterns/${id}`, { method:'DELETE', headers: authHeaders() });
  loadPatterns();
}

async function loadPatterns() {
  const res = await fetch('/api/patterns');
  const pats = await res.json();
  const tbody = document.getElementById('patterns-list');
  tbody.innerHTML = pats.map(p => `
    <tr>
      <td><code>${escapeHtml(p.from_pattern)}</code></td>
      <td><code>${escapeHtml(p.to_template)}</code></td>
      <td><span class="pill ${p.enabled?'on':'off'}">${p.enabled?'enabled':'disabled'}</span></td>
      <td>
        <button class="secondary" onclick="togglePattern(${p.id})">${p.enabled?'Disable':'Enable'}</button>
        <button class="danger" onclick="deletePattern(${p.id})">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="color:var(--muted)">No pattern rules yet.</td></tr>';
}

async function addWatchlist() {
  const u = document.getElementById('watch-input').value.trim();
  if (!u) return;
  await fetch('/api/watchlist', { method:'POST', headers: authHeaders(), body: JSON.stringify({url:u}) });
  document.getElementById('watch-input').value = '';
  loadWatchlist();
}

async function importSitemap() {
  const u = document.getElementById('sitemap-input').value.trim();
  if (!u) return;
  const toast = document.getElementById('toast');
  toast.textContent = 'Fetching sitemap...';
  showLoader('Importing Sitemap.xml...', `Fetching and parsing URLs from "${u}"`);
  try {
    const res = await fetch('/api/watchlist/import_sitemap', { method:'POST', headers: authHeaders(), body: JSON.stringify({sitemap_url:u}) });
    const d = await res.json();
    if (d.ok) toast.textContent = `Imported ${d.added} new URL(s) out of ${d.found} found in sitemap. Total watchlist: ${d.total}.`;
    else toast.textContent = 'Error: ' + (d.error || 'Failed');
    loadWatchlist();
  } finally {
    hideLoader();
  }
}

async function scanWatchlistNow() {
  const toast = document.getElementById('toast');
  toast.textContent = 'Scanning watchlist...';
  showLoader('Scanning 404 Watchlist...', 'Probing watched URLs to detect 404 broken links');
  try {
    const res = await fetch('/api/watchlist/scan_now', { method:'POST', headers: authHeaders() });
    const d = await res.json();
    toast.textContent = `Scan done. Checked ${d.checked} URLs. Found ${d.broken_404s || 0} broken link(s).`;
    loadWatchlist();
  } finally {
    hideLoader();
  }
}

async function loadWatchlist() {
  const res = await fetch('/api/watchlist');
  const list = await res.json();
  const tbody = document.getElementById('watchlist-rows');
  tbody.innerHTML = list.map(w => {
    let cls = 'status-unknown';
    let label = 'not checked yet';
    if (w.last_status === 404) { cls = 'status-404'; label = '404 (broken)'; }
    else if (w.last_status) { cls = 'status-ok'; label = w.last_status; }
    return `<tr><td>${escapeHtml(w.url)}</td><td class="${cls}">${label}</td><td>${w.last_checked ? new Date(w.last_checked*1000).toLocaleString() : '—'}</td></tr>`;
  }).join('') || '<tr><td colspan="3" style="color:var(--muted)">Watchlist is empty.</td></tr>';
}

loadPatterns();
loadWatchlist();
