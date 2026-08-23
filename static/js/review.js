/* Redirector - Review & Apply Page JS Logic */
function authHeaders() {
  return { 'Content-Type': 'application/json', 'X-App-Secret': window.APP_SECRET };
}

let DATA = [];
let SHOP = '';
let CONFIGURED = false;
let currentPage = 1;

async function uploadBrokenFile(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);

  const label = input.parentElement;
  const origText = label.childNodes[0].nodeValue;
  label.childNodes[0].nodeValue = 'Uploading & Matching... ';
  label.style.opacity = '0.6';
  label.style.pointerEvents = 'none';

  showLoader('Uploading & Matching File...', `Processing "${file.name}"... Extracting broken links & auto-matching against catalog.`, true);
  updateLoaderProgress(15, `Reading "${file.name}" & extracting URLs...`, 'Processing...');

  try {
    updateLoaderProgress(45, `Parsing spreadsheet rows & checking deduplication...`, 'Processing...');
    const res = await fetch('/api/upload_broken_links', {
      method: 'POST',
      headers: { 'X-App-Secret': window.APP_SECRET },
      body: formData,
    });
    updateLoaderProgress(85, `Resolving candidate matches & updating database...`, 'Almost done...');
    const d = await res.json();
    if (!res.ok || !d.ok) {
      triggerAppliedToast('Upload failed: ' + (d.error || 'Unknown error'), 'error');
    } else {
      updateLoaderProgress(100, `Done! Extracted ${d.total_extracted} URLs.`, 'Completed');
      await loadState();
      triggerAppliedToast(`Extracted ${d.total_extracted} URL(s) (${d.new_added} new URL(s) added to pending review list).`, 'success');
    }
  } catch (e) {
    triggerAppliedToast('Failed to upload file: ' + e, 'error');
  } finally {
    hideLoader();
    input.value = '';
    label.childNodes[0].nodeValue = origText;
    label.style.opacity = '1';
    label.style.pointerEvents = 'auto';
  }
}

async function checkAllHttpStatuses() {
  const btn = document.getElementById('check-http-btn');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking 200/404...';

  const totalItems = DATA.length || 1;
  showLoader(
    'Checking Live HTTP Statuses...',
    `Testing storefront URLs live (200 OK / 404 Not Found)...`,
    true
  );
  updateLoaderProgress(5, `Preparing HTTP checks for ${totalItems} URLs...`, 'Estimating time...');

  const startTime = Date.now();
  const chunkSize = 25;
  let processed = 0;

  try {
    const ids = DATA.map(d => d.id);
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const res = await fetch('/api/check_statuses', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ids: chunk }),
      });
      if (res.status === 403) { window.location.reload(); return; }
      const d = await res.json();

      processed += chunk.length;
      const pct = (processed / ids.length) * 100;
      const elapsedSec = Math.max(0.5, (Date.now() - startTime) / 1000);
      const rate = processed / elapsedSec;
      const remainingSec = rate > 0 ? Math.ceil((ids.length - processed) / rate) : 0;
      const etaStr = remainingSec > 0 ? (typeof formatEta === 'function' ? formatEta(remainingSec) : `Est. ~${remainingSec}s remaining`) : 'Finalizing...';

      updateLoaderProgress(pct, `Tested ${processed} / ${ids.length} storefront URLs (200 OK / 404 Not Found)...`, etaStr);
    }

    await loadState();
    triggerAppliedToast(`Checked ${processed} URL(s)! HTTP status badges updated ✓`, 'success');
  } catch (e) {
    triggerAppliedToast('Failed to check HTTP statuses: ' + e, 'error');
  } finally {
    hideLoader();
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function triggerRematch(refetchCatalog) {
  const btn = refetchCatalog ? document.getElementById('refetch-rematch-btn') : document.getElementById('rematch-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = refetchCatalog ? 'Fetching from Shopify...' : 'Rescanning...';

  showLoader(
    refetchCatalog ? 'Syncing Catalog & Rescanning...' : 'Rescanning Match Engine...',
    refetchCatalog ? 'Connecting to Shopify GraphQL API & updating catalog...' : 'Preparing broken link rescan...',
    true
  );

  const startTime = Date.now();

  try {
    let totalPending = 0;
    let catalogRefetched = false;
    let productsCount = 0;

    if (refetchCatalog) {
      updateLoaderProgress(10, 'Fetching fresh active products from Shopify GraphQL API...', 'Connecting to Shopify...');
      const syncRes = await fetch('/api/rematch', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ refetch_catalog: true, sync_catalog_only: true }),
      });
      const syncData = await syncRes.json();
      if (!syncRes.ok || syncData.error) {
        triggerAppliedToast('Error fetching catalog: ' + (syncData.error || 'Failed'), 'error');
        return;
      }
      totalPending = syncData.total_pending || 0;
      productsCount = syncData.products_count || 0;
      catalogRefetched = syncData.products_refetched || false;
      updateLoaderProgress(20, `Catalog synced (${productsCount} products). Starting broken link match engine...`, 'Starting rescan...');
    }

    const batchSize = 80;
    let offset = 0;
    let totalRematched = 0;

    if (!totalPending) {
      const initRes = await fetch('/api/rematch', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ offset: 0, limit: batchSize }),
      });
      const initData = await initRes.json();
      if (!initRes.ok || initData.error) {
        triggerAppliedToast('Error rescanning: ' + (initData.error || 'Failed'), 'error');
        return;
      }
      totalPending = initData.total || 0;
      productsCount = initData.products_count || 0;
      offset += batchSize;
      totalRematched += (initData.rematched_count || 0);
    }

    if (totalPending > 0) {
      while (offset < totalPending) {
        const pct = Math.min(98, Math.round((offset / totalPending) * 100));
        const elapsedSec = Math.max(0.5, (Date.now() - startTime) / 1000);
        const rate = offset / elapsedSec;
        const remainingSec = rate > 0 ? Math.ceil((totalPending - offset) / rate) : 0;
        const etaStr = remainingSec > 0 ? (typeof formatEta === 'function' ? formatEta(remainingSec) : `Est. ~${remainingSec}s remaining`) : 'Finalizing...';

        updateLoaderProgress(pct, `Executing fuzzy match engine (${offset} / ${totalPending} links processed)...`, etaStr);

        const res = await fetch('/api/rematch', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ offset: offset, limit: batchSize }),
        });
        const d = await res.json();
        if (!res.ok || d.error) {
          triggerAppliedToast('Error rescanning: ' + (d.error || 'Unknown error'), 'error');
          return;
        }
        totalRematched += (d.rematched_count || 0);
        offset += batchSize;
      }
    }

    updateLoaderProgress(100, `Rescan completed! Rematched ${totalPending} broken links against ${productsCount} products.`, 'Completed');
    await loadState();
    triggerAppliedToast(`Rematched ${totalPending} broken link(s) against ${productsCount} catalog products.` + (catalogRefetched ? ' (Catalog refreshed from Shopify)' : ''), 'success');
  } catch (e) {
    triggerAppliedToast('Failed to rescan: ' + e, 'error');
  } finally {
    setTimeout(() => {
      hideLoader();
      btn.disabled = false;
      btn.textContent = originalText;
    }, 400);
  }
}

async function loadState() {
  const res = await fetch('/api/state');
  const data = await res.json();
  DATA = data.matches;
  SHOP = data.shop;
  CONFIGURED = data.configured;
  const badge = document.getElementById('conn-badge');
  if (CONFIGURED) {
    badge.textContent = 'Connected: ' + SHOP;
    badge.className = 'badge ok';
  } else {
    badge.textContent = 'Not connected — edit config.json or .env';
    badge.className = 'badge bad';
  }
  render();
}

function confClass(score) {
  if (score >= 0.7) return 'high';
  if (score >= 0.45) return 'mid';
  return 'low';
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function resetPaginationAndRender() {
  currentPage = 1;
  render();
}

function extractTitleFromUrl(urlStr) {
  if (!urlStr) return '';
  let clean = urlStr.split('?')[0].split('#')[0];
  try {
    clean = decodeURIComponent(clean);
  } catch (e) {}

  clean = clean.replace(/\/+$/, '').replace(/\.(html?|php|aspx?)$/i, '');

  let slug = '';
  const prodMatch = clean.match(/\/products\/([^\/]+)/i);
  if (prodMatch && prodMatch[1]) {
    slug = prodMatch[1];
  } else {
    const parts = clean.split('/').filter(Boolean);
    slug = parts.length > 0 ? parts[parts.length - 1] : clean;
  }

  let name = slug.replace(/[-_+]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return urlStr;

  return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function copyToClipboard(text, btnEl) {
  if (!text) return;
  const showFeedback = () => {
    if (btnEl) {
      const origText = btnEl.getAttribute('data-orig') || btnEl.innerHTML;
      if (!btnEl.getAttribute('data-orig')) {
        btnEl.setAttribute('data-orig', origText);
      }
      btnEl.innerHTML = '✓ Copied!';
      btnEl.classList.add('copied');
      setTimeout(() => {
        btnEl.innerHTML = btnEl.getAttribute('data-orig');
        btnEl.classList.remove('copied');
      }, 1500);
    }
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(showFeedback).catch(() => fallbackCopyText(text, showFeedback));
  } else {
    fallbackCopyText(text, showFeedback);
  }
}

function fallbackCopyText(text, cb) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    if (cb) cb();
  } catch (err) {
    console.error('Copy failed:', err);
  }
  document.body.removeChild(textArea);
}

function copyFromAttr(btnEl, attrName) {
  const text = btnEl.getAttribute(attrName || 'data-copy');
  copyToClipboard(text, btnEl);
}

function searchByTitle(title) {
  const searchInput = document.getElementById('search');
  if (searchInput) {
    searchInput.value = title;
    resetPaginationAndRender();
  }
}

function setFilterTab(filterVal) {
  const filterSelect = document.getElementById('filter');
  if (filterSelect) {
    filterSelect.value = filterVal;
  }
  localStorage.setItem('review_filter', filterVal);
  resetPaginationAndRender();
}

function initFilterState() {
  const savedFilter = localStorage.getItem('review_filter') || 'pending';
  const filterSelect = document.getElementById('filter');
  if (filterSelect) {
    filterSelect.value = savedFilter;
  }
}

function render() {
  const list = document.getElementById('list');
  const pagBottom = document.getElementById('pagination-bottom');
  const searchInput = document.getElementById('search');
  const q = searchInput ? searchInput.value.toLowerCase() : '';
  const filterSelect = document.getElementById('filter');
  const filter = filterSelect ? filterSelect.value : 'pending';
  const pageSizeVal = document.getElementById('page-size').value;
  const pageSize = pageSizeVal === 'all' ? Infinity : parseInt(pageSizeVal, 10);
  list.innerHTML = '';

  // Save active filter to localStorage
  localStorage.setItem('review_filter', filter);

  // Update header tab active visual states
  document.querySelectorAll('.stat-tab').forEach(tab => {
    const tabFilter = tab.getAttribute('data-filter');
    if (tabFilter === filter) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  let counts = { confirmed: 0, rejected: 0, ignored: 0, pending: 0, applied: 0, skipped: 0, error: 0 };

  const filtered = DATA.filter(item => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    const topScore = item.matches.length ? item.matches[0].score : 0;

    if (filter === 'pending' && item.status !== 'pending') return false;
    if (filter === 'confirmed' && item.status !== 'confirmed') return false;
    if (filter === 'applied' && item.status !== 'applied') return false;
    if (filter === 'skipped' && item.status !== 'skipped') return false;
    if (filter === 'ignored' && item.status !== 'ignored' && item.status !== 'rejected') return false;
    if (filter === 'rejected' && item.status !== 'rejected' && item.status !== 'ignored') return false;
    if (filter === 'error' && item.status !== 'error') return false;
    if (filter === 'low' && topScore >= 0.5) return false;
    if (q && !item.broken_url.toLowerCase().includes(q) &&
      !item.matches.some(m => m.title.toLowerCase().includes(q))) return false;
    return true;
  });

  const totalItems = filtered.length;
  const totalPages = pageSize === Infinity ? 1 : Math.ceil(totalItems / pageSize) || 1;

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = pageSize === Infinity ? 0 : (currentPage - 1) * pageSize;
  const endIdx = pageSize === Infinity ? totalItems : Math.min(startIdx + pageSize, totalItems);
  const pageItems = filtered.slice(startIdx, endIdx);

  if (pageItems.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:40px; color:var(--muted);">No matching broken links found.</div>';
  } else {
    pageItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'bg-surface border border-outline-variant rounded-2xl p-4 flex flex-col lg:flex-row items-stretch gap-4 transition-all hover:shadow-md duration-200 group relative overflow-hidden ' + item.status;
      const chosen = item.matches[item.chosen_index] || null;

      let httpBadge = '';
      if (item.http_status === 200) {
        httpBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 inline-flex items-center gap-1 ml-2" title="Page is live (200 OK)"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 200 OK</span>`;
      } else if (item.http_status === 404) {
        httpBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-rose-500/10 text-rose-600 border border-rose-500/20 inline-flex items-center gap-1 ml-2" title="404 Not Found - broken link"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span> 404 Not Found</span>`;
      } else if (item.http_status === 301 || item.http_status === 302) {
        httpBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 inline-flex items-center gap-1 ml-2" title="Redirect active">🟡 ${escapeHtml(item.http_label || 'Redirect')}</span>`;
      } else if (item.http_status === 429) {
        httpBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-700 border border-amber-500/30 inline-flex items-center gap-1 ml-2" title="429 Rate Limited - Throttled by storefront anti-bot firewall.">⚠️ 429 Throttled</span>`;
      } else if (item.http_status) {
        httpBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-surface-container-high text-on-surface-variant border border-outline-variant inline-flex items-center gap-1 ml-2">${escapeHtml(item.http_label)}</span>`;
      }

      const extractedTitle = extractTitleFromUrl(item.broken_url);

      row.innerHTML = `
        <div class="flex-1 flex flex-col justify-between min-w-[280px] lg:border-r border-outline-variant pr-0 lg:pr-4 pb-3 lg:pb-0 border-b lg:border-b-0">
          <div>
            <div class="flex items-center gap-1 text-xs font-semibold text-on-surface-variant mb-1">
              <span class="material-symbols-outlined text-[16px] text-primary">link_off</span>
              Broken Link ${httpBadge}
            </div>
            <div class="bg-surface-container-low p-2 rounded-xl border border-outline-variant mb-2 flex items-start justify-between gap-2">
              <div class="font-code text-xs font-semibold text-on-surface break-all" title="${escapeHtml(item.broken_url)}">
                ${escapeHtml(item.broken_url)}
              </div>
              <button class="p-1 text-primary hover:bg-surface-container hover:scale-110 active:scale-95 rounded-lg transition-all shrink-0" data-copy="${escapeHtml(item.broken_url)}" onclick="copyFromAttr(this)" title="Copy Broken Link URL">
                <span class="material-symbols-outlined text-[16px]">content_copy</span>
              </button>
            </div>

            <div class="bg-surface-container-lowest p-2 rounded-xl border border-outline-variant flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 overflow-hidden">
                <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant px-1.5 py-0.5 bg-surface-container-high rounded border border-outline-variant">Title</span>
                <span class="text-xs font-bold text-on-surface truncate">${escapeHtml(extractedTitle)}</span>
              </div>
              <button class="p-1 text-primary hover:bg-surface-container hover:scale-110 active:scale-95 rounded-lg transition-all" data-copy="${escapeHtml(extractedTitle)}" onclick="copyFromAttr(this)" title="Copy Title">
                <span class="material-symbols-outlined text-[16px]">content_copy</span>
              </button>
            </div>
          </div>
          ${item.http_status === 200 ? `<div class="text-[11px] text-emerald-600 font-medium mt-2 flex items-center gap-1">💡 Live page (200 OK). Click <b>Don't Redirect</b> to keep active.</div>` : ''}
        </div>

        <div class="flex-[1.5] flex flex-col justify-between min-w-[320px] px-0 lg:px-2">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-1 text-xs font-semibold text-on-surface-variant">
                <span class="material-symbols-outlined text-primary text-[16px]">auto_awesome</span>
                Suggested Target Match
              </div>
              ${chosen ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${confClass(chosen.score) === 'high' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : confClass(chosen.score) === 'mid' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'}">${Math.round(chosen.score * 100)}% MATCH</span>` : ''}
            </div>

            ${item.custom_target ? `
              <div class="text-xs font-bold text-primary bg-primary/10 border border-primary/30 p-2.5 rounded-xl mb-2 flex items-center justify-between gap-2">
                <span>🎯 Custom Target: <code class="text-on-surface bg-surface-container-high px-1.5 py-0.5 rounded border border-outline-variant">${escapeHtml(item.custom_target)}</code></span>
                <button class="px-2 py-0.5 bg-rose-500 text-white rounded-lg text-[11px] font-semibold hover:bg-rose-600 transition-all" onclick="clearCustomTarget(${item.id})">Clear</button>
              </div>
            ` : `
              ${chosen ? `
                <div class="flex items-center gap-3 p-2.5 bg-surface-container-lowest border border-outline-variant rounded-xl mb-2">
                  ${chosen.image_url ? `<img class="w-10 h-10 rounded-lg object-cover border border-outline-variant shrink-0" src="${escapeHtml(chosen.image_url)}" alt="" onerror="this.outerHTML='<div class=&quot;w-10 h-10 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center text-[10px] text-on-surface-variant shrink-0&quot;>No img</div>'">` : '<div class="w-10 h-10 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center text-[10px] text-on-surface-variant shrink-0">No img</div>'}
                  <div class="flex flex-col overflow-hidden">
                    <span class="text-xs font-bold text-on-surface truncate">${escapeHtml(chosen.title)}</span>
                    <span class="text-[11px] font-medium text-on-surface-variant truncate">${escapeHtml(chosen.url)}</span>
                  </div>
                </div>
              ` : '<div class="text-xs text-on-surface-variant p-2 bg-surface-container-low rounded-xl border border-outline-variant mb-2">No candidates found</div>'}

              ${item.matches.length > 1 ? `
                <select class="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-xl px-2.5 py-1 text-xs font-medium focus:border-primary outline-none cursor-pointer" onchange="chooseAlt(${item.id}, this.value)">
                  ${item.matches.map((m, idx) => `<option value="${idx}" ${idx === item.chosen_index ? 'selected' : ''}>${escapeHtml(m.title)} (${Math.round(m.score * 100)}%)</option>`).join('')}
                </select>
              ` : ''}
            `}

            <div class="mt-2">
              <button class="px-2.5 py-1 border border-outline-variant text-primary rounded-xl text-xs font-semibold hover:bg-surface-container-low transition-all" onclick="toggleCustomBox(${item.id})">${item.custom_target ? '✏️ Edit Custom Target' : '➕ Custom Target URL'}</button>
              <div id="custom-box-${item.id}" class="mt-2 hidden items-center gap-2">
                <input type="text" class="flex-1 bg-surface-container-lowest border border-outline-variant text-on-surface rounded-xl px-2.5 py-1 text-xs font-medium focus:border-primary outline-none" id="custom-input-${item.id}" placeholder="Type target URL e.g. /collections/clearance" value="${escapeHtml(item.custom_target || '')}" onkeydown="if(event.key==='Enter') saveCustomTarget(${item.id})">
                <button class="px-3 py-1 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:bg-primary/90 transition-all" onclick="saveCustomTarget(${item.id})">Save</button>
              </div>
            </div>
          </div>

          ${item.status === 'error' ? `<div class="text-xs font-semibold text-rose-600 mt-2">${escapeHtml(item.error || 'Failed to apply')}</div>` : ''}
          ${item.status === 'skipped' ? `<div class="text-xs font-semibold text-amber-600 mt-2">${escapeHtml(item.skipped_msg || 'Skipped: redirect already exists on Shopify')}</div>` : ''}
          ${item.status === 'applied' ? `<div class="text-xs font-semibold text-emerald-600 mt-2 flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">verified</span> Live on Shopify (redirect #${item.applied_redirect_id || 'active'}) ${item.http_status !== 404 ? '— Verified Live 301 ✓' : '— Verifying live 301 redirect...'}</div>` : ''}
        </div>

        <div class="flex flex-row lg:flex-col justify-center items-stretch gap-2 shrink-0 border-t lg:border-t-0 lg:border-l border-outline-variant pt-3 lg:pt-0 pl-0 lg:pl-4">
          <button class="confirm px-4 py-2 rounded-xl text-xs font-bold transition-all border ${item.status === 'confirmed' ? 'bg-blue-500/20 text-blue-400 border-blue-500/60 shadow-sm' : 'bg-transparent border-blue-500/30 text-blue-500 hover:bg-blue-500/10'}" onclick="setStatus(${item.id}, 'confirmed')">Confirm</button>
          <button class="reject px-4 py-2 rounded-xl text-xs font-bold transition-all border ${item.status === 'ignored' || item.status === 'rejected' ? 'bg-rose-500/20 text-rose-400 border-rose-500/60 shadow-sm' : 'bg-transparent border-rose-500/30 text-rose-500 hover:bg-rose-500/10'}" onclick="setStatus(${item.id}, 'ignored')">Don't Redirect</button>
          <button class="apply px-4 py-2 rounded-xl text-xs font-bold transition-all ${item.status === 'applied' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-emerald-600 text-white hover:bg-emerald-700'} disabled:opacity-75 disabled:cursor-not-allowed" onclick="applyOne(${item.id}, event)" ${item.status === 'applied' || item.status === 'skipped' || item.status === 'ignored' ? 'disabled' : ''}>${item.status === 'applied' ? 'Applied ✓' : item.status === 'skipped' ? 'Skipped ⚠' : item.status === 'ignored' ? 'Keep Live' : 'Apply now'}</button>
        </div>
      `;
      list.appendChild(row);
    });
  }

  document.getElementById('stat-total').textContent = DATA.length;
  document.getElementById('stat-applied').textContent = counts.applied || 0;
  document.getElementById('stat-confirmed').textContent = counts.confirmed || 0;
  document.getElementById('stat-pending').textContent = counts.pending || 0;

  if (totalItems > 0 && pageSize !== Infinity) {
    pagBottom.style.display = 'flex';
    pagBottom.innerHTML = `
      <div>Showing <b>${startIdx + 1}</b>–<b>${endIdx}</b> of <b>${totalItems}</b> results</div>
      <div class="pagination-controls">
        <button onclick="goToPage(1)" ${currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
        <button onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&lt; Prev</button>
        <span style="margin: 0 8px; font-size: 12px; color: var(--text);">Page <b>${currentPage}</b> of <b>${totalPages}</b></span>
        <button onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next &gt;</button>
        <button onclick="goToPage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
      </div>
    `;
  } else {
    pagBottom.style.display = 'none';
  }
}

function goToPage(p) {
  currentPage = p;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleCustomBox(id) {
  const box = document.getElementById(`custom-box-${id}`);
  if (box) {
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'flex' : 'none';
    if (box.style.display === 'flex') {
      const input = document.getElementById(`custom-input-${id}`);
      if (input) input.focus();
    }
  }
}

async function saveCustomTarget(id) {
  const input = document.getElementById(`custom-input-${id}`);
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  const item = DATA.find(d => d.id === id);
  item.custom_target = val;
  try {
    await fetch('/api/set_status', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ id: id, custom_target: val }),
    });
  } catch (e) { }
  render();
}

async function clearCustomTarget(id) {
  const item = DATA.find(d => d.id === id);
  item.custom_target = null;
  try {
    await fetch('/api/set_status', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ id: id, custom_target: '' }),
    });
  } catch (e) { }
  render();
}

async function setStatus(id, status) {
  const item = DATA.find(d => d.id === id);
  const newStatus = (item.status === status) ? 'pending' : status;
  item.status = newStatus;
  try {
    const res = await fetch('/api/set_status', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ id, status: newStatus }) });
    if (res.status === 403) { window.location.reload(); return; }
  } catch (e) { }

  if (newStatus === 'ignored') {
    triggerAppliedToast('Redirection Ignored', 'ignored');
  } else if (newStatus === 'confirmed') {
    triggerAppliedToast('Redirection Confirmed', 'confirmed');
  }

  render();
}

async function chooseAlt(id, idx) {
  const item = DATA.find(d => d.id === id);
  item.chosen_index = parseInt(idx, 10);
  try {
    const res = await fetch('/api/set_status', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ id, chosen_index: item.chosen_index }) });
    if (res.status === 403) { window.location.reload(); return; }
  } catch (e) { }
  render();
}

function triggerAppliedToast(msg, type) {
  if (typeof window.showAppliedToast === 'function') {
    window.showAppliedToast(msg, type);
  } else if (typeof showAppliedToast === 'function') {
    showAppliedToast(msg, type);
  }
}

async function applyOne(id, evt) {
  if (!CONFIGURED) { triggerAppliedToast('Store not connected yet — fill in config.json or .env with your shop + access token', 'error'); return; }
  const btn = evt ? evt.target : null;
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Applying...'; }

  try {
    const res = await fetch('/api/apply_one', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ id }) });
    if (res.status === 403) {
      triggerAppliedToast('Session expired due to server restart. Refreshing page...', 'error');
      window.location.reload();
      return;
    }
    const result = await res.json();
    await loadState();
    if (result.status === 'skipped') {
      triggerAppliedToast(result.skipped_msg || 'Skipped: redirect already exists on Shopify', 'info');
    } else if (!result.ok) {
      triggerAppliedToast('Failed to apply: ' + (result.error || 'Unknown error'), 'error');
    } else {
      triggerAppliedToast('Redirection Applied Live to Shopify ✓', 'success');
      setTimeout(async () => {
        try {
          await fetch('/api/check_statuses', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ids: [id] }) });
          await loadState();
        } catch (e) { }
      }, 15000);
    }
  } catch (e) {
    triggerAppliedToast('Error applying redirect: ' + e, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

async function applyAllConfirmed() {
  if (!CONFIGURED) { triggerAppliedToast('Store not connected yet — fill in config.json or .env with your shop + access token', 'error'); return; }
  const ids = DATA.filter(d => d.status === 'confirmed').map(d => d.id);
  if (!ids.length) { triggerAppliedToast('No confirmed rows to apply yet. Click "Confirm" on rows first.', 'info'); return; }

  const confirmed = typeof window.showAppConfirm === 'function' ? await window.showAppConfirm({
    title: 'Apply Confirmed Redirects',
    message: `This will create ${ids.length} live 301 redirects on Shopify right now. Continue?`,
    confirmText: 'Apply Live Redirects',
    cancelText: 'Cancel'
  }) : confirm(`This will create ${ids.length} live redirects on Shopify right now. Continue?`);

  if (!confirmed) return;

  showLoader('Applying Redirects to Shopify...', `Creating ${ids.length} live 301 redirects on your store.`, true);
  updateLoaderProgress(5, `Starting batch creation of ${ids.length} redirects...`, 'Estimating time...');

  const startTime = Date.now();
  const chunkSize = 20;
  let processed = 0;

  try {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const res = await fetch('/api/apply', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ids: chunk }) });
      if (res.status === 403) { window.location.reload(); return; }
      await res.json();
      
      processed += chunk.length;
      const pct = (processed / ids.length) * 100;
      const elapsedSec = Math.max(0.5, (Date.now() - startTime) / 1000);
      const rate = processed / elapsedSec;
      const remainingSec = rate > 0 ? Math.ceil((ids.length - processed) / rate) : 0;
      const etaStr = remainingSec > 0 ? (typeof formatEta === 'function' ? formatEta(remainingSec) : `Est. ~${remainingSec}s remaining`) : 'Finalizing...';

      updateLoaderProgress(pct, `Applied ${processed} / ${ids.length} redirects to Shopify`, etaStr);
    }

    await loadState();
    triggerAppliedToast(`${ids.length} 301 Redirection(s) Applied Live to Shopify ✓`, 'success');
  } catch (e) {
    triggerAppliedToast('Error applying confirmed redirects: ' + e, 'error');
  } finally {
    hideLoader();
  }
}

async function instantFix() {
  const input = document.getElementById('instant-input');
  const url = input.value.trim();
  if (!url) return;

  showLoader('Finding Product Match...', `Analyzing broken URL "${url}" against catalog`);

  try {
    const res = await fetch('/api/instant', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ broken_url: url }) });
    if (res.status === 403) { window.location.reload(); return; }
    const row = await res.json();
    input.value = '';
    await loadState();
    document.getElementById('filter').value = 'pending';
    document.getElementById('search').value = url;
    resetPaginationAndRender();
    triggerAppliedToast(`Added & matched broken URL: ${url}`, 'success');
  } catch (e) {
    triggerAppliedToast('Error adding instant fix URL: ' + e, 'error');
  } finally {
    hideLoader();
  }
}

function downloadExport(fmt) {
  const scope = document.getElementById('export-scope').value;
  const format = fmt || (document.getElementById('export-format') ? document.getElementById('export-format').value : 'xlsx');
  window.location.href = `/api/export.${format}?filter=${scope}`;
}

document.getElementById('search').addEventListener('input', resetPaginationAndRender);
document.getElementById('filter').addEventListener('change', resetPaginationAndRender);
document.getElementById('page-size').addEventListener('change', resetPaginationAndRender);

initFilterState();
loadState();
setInterval(loadState, 15000);
