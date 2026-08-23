/* Redirector - Dashboard JS Logic */
let ROWS = [];

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function load() {
  const res = await fetch('/api/kpis');
  const d = await res.json();
  ROWS = d.rows;

  const badge = document.getElementById('conn-badge');
  if (d.configured) { badge.textContent = 'Connected: ' + d.shop; badge.className = 'badge ok'; }
  else { badge.textContent = 'Not connected'; badge.className = 'badge bad'; }

  const kpiGrid = document.getElementById('kpi-grid');
  kpiGrid.innerHTML = `
    <div class="bg-surface border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden transition-all hover:shadow-md">
      <div class="flex justify-between items-start mb-3">
        <span class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Health Score</span>
        <span class="material-symbols-outlined text-emerald-500 text-[20px]">health_and_safety</span>
      </div>
      <div>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-bold text-on-surface">${d.fixed_pct}%</span>
          <span class="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Healthy</span>
        </div>
        <div class="w-full bg-surface-container-high h-1.5 mt-3 rounded-full overflow-hidden">
          <div class="bg-emerald-500 h-full rounded-full" style="width: ${d.fixed_pct}%;"></div>
        </div>
      </div>
    </div>

    <div class="bg-surface border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
      <div class="flex justify-between items-start mb-3">
        <span class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Broken Links</span>
        <span class="material-symbols-outlined text-primary text-[20px]">link_off</span>
      </div>
      <div>
        <span class="text-2xl font-bold text-on-surface">${d.total}</span>
        <p class="text-xs text-on-surface-variant mt-1 flex items-center gap-1">
          <span class="material-symbols-outlined text-primary text-[14px]">analytics</span> Total analyzed
        </p>
      </div>
    </div>

    <div class="bg-surface border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
      <div class="flex justify-between items-start mb-3">
        <span class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Active 301 Redirects</span>
        <span class="material-symbols-outlined text-emerald-500 text-[20px]">alt_route</span>
      </div>
      <div>
        <span class="text-2xl font-bold text-on-surface">${d.by_status.applied || 0}</span>
        <p class="text-xs text-emerald-600 mt-1 flex items-center gap-1 font-semibold">
          <span class="material-symbols-outlined text-[14px]">check_circle</span> Live on Shopify
        </p>
      </div>
    </div>

    <div class="bg-surface border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
      <div class="flex justify-between items-start mb-3">
        <span class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Pending Review</span>
        <span class="material-symbols-outlined text-amber-500 text-[20px]">hourglass_empty</span>
      </div>
      <div>
        <span class="text-2xl font-bold text-on-surface">${d.by_status.pending || 0}</span>
        <div class="w-full bg-surface-container-high h-1.5 mt-3 rounded-full overflow-hidden">
          <div class="bg-amber-500 h-full rounded-full" style="width: ${d.total ? Math.round(((d.by_status.pending || 0) / d.total) * 100) : 0}%;"></div>
        </div>
      </div>
    </div>
  `;

  const statusColors = { applied:'var(--accent)', confirmed:'var(--good)', pending:'var(--muted)', rejected:'var(--muted)', error:'var(--bad)' };
  const statusBars = document.getElementById('status-bars');
  statusBars.innerHTML = Object.entries(d.by_status).map(([k,v]) => `
    <div class="bar-row">
      <div class="bar-label">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${d.total ? (v/d.total*100) : 0}%; background:${statusColors[k] || 'var(--muted)'}"></div></div>
      <div class="bar-count">${v}</div>
    </div>
  `).join('');

  const confLabels = {
    high: 'High Confidence (≥70%)',
    mid: 'Mid Confidence (45–69%)',
    low: 'Low Confidence (<45%)',
    none: 'No Match / Custom Target'
  };

  const confColors = {
    high: '#10b981',
    mid: '#f59e0b',
    low: '#ef4444',
    none: '#6b7280'
  };

  const confBgColors = {
    high: 'rgba(16, 185, 129, 0.15)',
    mid: 'rgba(245, 158, 11, 0.15)',
    low: 'rgba(239, 68, 68, 0.15)',
    none: 'rgba(107, 114, 128, 0.15)'
  };

  const confBars = document.getElementById('conf-bars');
  confBars.innerHTML = Object.entries(d.conf_buckets).map(([k, v]) => {
    const pct = d.total ? Math.round((v / d.total) * 100) : 0;
    return `
      <div class="flex flex-col gap-1 p-2.5 rounded-xl border border-outline-variant hover:bg-surface-container-low transition-all cursor-pointer group" onclick="filterByConfidence('${k}')" title="Click to filter table rows by ${confLabels[k]}">
        <div class="flex items-center justify-between text-xs font-bold">
          <span class="flex items-center gap-1.5 text-on-surface">
            <span class="w-2.5 h-2.5 rounded-full" style="background:${confColors[k]};"></span>
            ${confLabels[k]}
          </span>
          <span class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold" style="background:${confBgColors[k]}; color:${confColors[k]};">${pct}%</span>
            <span class="text-on-surface font-extrabold text-sm">${v}</span>
          </span>
        </div>
        <div class="w-full bg-surface-container-high h-2.5 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500 group-hover:brightness-110" style="width:${pct}%; background:${confColors[k]};"></div>
        </div>
      </div>
    `;
  }).join('');

  renderRows();
}

let activeConfFilter = 'all';

function filterByConfidence(bucket) {
  activeConfFilter = (activeConfFilter === bucket) ? 'all' : bucket;
  renderRows();
}

function renderRows() {
  const q = document.getElementById('search').value.toLowerCase();
  const filter = document.getElementById('filter').value;
  const tbody = document.getElementById('rows');

  const filtered = ROWS.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (q && !r.broken_url.toLowerCase().includes(q) && !(r.matched_title || '').toLowerCase().includes(q)) return false;

    if (activeConfFilter === 'high' && (r.score === null || r.score < 0.7)) return false;
    if (activeConfFilter === 'mid' && (r.score === null || r.score < 0.45 || r.score >= 0.7)) return false;
    if (activeConfFilter === 'low' && (r.score === null || r.score >= 0.45)) return false;
    if (activeConfFilter === 'none' && r.score !== null) return false;

    return true;
  });

  tbody.innerHTML = filtered.slice(0, 200).map(r => `
    <tr class="hover:bg-surface-container-low transition-colors">
      <td class="p-3 font-code text-xs font-semibold text-on-surface break-all">${escapeHtml(r.broken_url)}</td>
      <td class="p-3 text-xs font-medium text-on-surface">${r.matched_title ? `<span class="font-bold">${escapeHtml(r.matched_title)}</span><br><span class="text-on-surface-variant text-[11px]">${escapeHtml(r.matched_url)}</span>` : '<span class="text-on-surface-variant italic">No match</span>'}</td>
      <td class="p-3 text-xs font-extrabold ${r.score >= 0.7 ? 'text-emerald-500' : r.score >= 0.45 ? 'text-amber-500' : r.score !== null ? 'text-rose-500' : 'text-on-surface-variant'}">${r.score !== null ? `${Math.round(r.score*100)}%` : '—'}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${r.status === 'applied' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : r.status === 'confirmed' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : r.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-surface-container-high text-on-surface-variant border border-outline-variant'}">${r.status}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="p-4 text-center text-xs text-on-surface-variant">No matching records</td></tr>';
}

function downloadExport(fmt) {
  const scope = document.getElementById('export-scope').value;
  const format = fmt || (document.getElementById('export-format') ? document.getElementById('export-format').value : 'xlsx');
  window.location.href = `/api/export.${format}?filter=${scope}`;
}

document.getElementById('search').addEventListener('input', renderRows);
document.getElementById('filter').addEventListener('change', renderRows);

load();
setInterval(load, 15000);
