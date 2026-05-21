const state = { data: null, active: "text" };
const $ = (id) => document.getElementById(id);

async function runScrape() {
  const status = $("status");
  status.textContent = "Scraping...";
  $("scrape").disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No active tab.");
    const selectionOnly = $("selectionOnly").checked;

    // Load scraper source and inject with options.
    const src = await (await fetch(chrome.runtime.getURL("scraper.js"))).text();
    const wrapped = `const SCRAPE_OPTS = ${JSON.stringify({ selectionOnly })};\n${src}\nreturn __MOODLE_SCRAPER_RESULT__;`;

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (code) => {
        // eslint-disable-next-line no-new-func
        return new Function(code)();
      },
      args: [wrapped],
    });

    state.data = normalizeScrapeResult(result && result.result);
    render();
    const total = state.data.text.length + state.data.videos.length + state.data.documents.length + state.data.images.length + state.data.links.length;
    status.textContent = `Done. ${total} items found on ${new URL(state.data.meta.url).hostname}.`;
  } catch (e) {
    console.error(e);
    status.textContent = "Error: " + (e.message || e);
  } finally {
    $("scrape").disabled = false;
  }
}

function render() {
  const d = state.data;
  if (!d) return;
  $("c-text").textContent = d.text.length;
  $("c-videos").textContent = d.videos.length;
  $("c-documents").textContent = d.documents.length;
  $("c-images").textContent = d.images.length;
  $("c-links").textContent = d.links.length;

  const list = $("list");
  const items = d[state.active] || [];
  if (!items.length) {
    list.innerHTML = `<div class="empty">No ${state.active} found.</div>`;
    return;
  }
  list.innerHTML = items.map((it) => {
    if (state.active === "text") {
      return `<div class="item">${it.heading ? `<div class="meta"><b>${escapeHtml(it.heading)}</b></div>` : ""}<div class="body">${escapeHtml(it.body)}</div></div>`;
    }
    if (state.active === "videos") {
      const thumb = it.thumbnail ? `<img src="${escapeAttr(it.thumbnail)}" style="width:120px;height:68px;object-fit:cover;border-radius:4px;flex-shrink:0;" />` : `<div style="width:120px;height:68px;background:#eef3f6;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#5c6b7a;flex-shrink:0;">${escapeHtml((it.provider||"video").toUpperCase())}</div>`;
      const playBtn = it.embedUrl && it.embedUrl !== it.url
        ? `<button data-embed="${escapeAttr(it.embedUrl)}" class="play-inline" style="margin-top:4px;font-size:10px;padding:3px 6px;">▶ Play here</button>`
        : "";
      return `<div class="item" style="display:flex;gap:10px;align-items:flex-start;">
        <a href="${escapeAttr(it.url)}" target="_blank" rel="noopener">${thumb}</a>
        <div style="flex:1;min-width:0;">
          <a href="${escapeAttr(it.url)}" target="_blank" rel="noopener" style="font-weight:600;">${escapeHtml(it.title || it.url)}</a>
          <div class="meta">${escapeHtml(it.provider || it.source)} ${it.id ? "• " + escapeHtml(it.id) : ""}</div>
          ${playBtn}
        </div>
      </div>`;
    }
    if (state.active === "documents") {
      const ext = (it.ext || "file").toUpperCase();
      const dl = it.url + (it.url.includes("?") ? "&" : "?") + "forcedownload=1";
      return `<div class="item">
        <div style="font-weight:600;">${escapeHtml(it.title || it.url)}</div>
        <div class="meta">${escapeHtml(ext)} • ${escapeHtml(it.url)}</div>
        <div style="margin-top:6px;display:flex;gap:6px;">
          <a href="${escapeAttr(it.url)}" target="_blank" rel="noopener" style="font-size:11px;padding:3px 8px;border:1px solid #14b8a6;color:#0f766e;border-radius:4px;text-decoration:none;">👁 View</a>
          <a href="${escapeAttr(dl)}" target="_blank" rel="noopener" style="font-size:11px;padding:3px 8px;background:#14b8a6;color:#fff;border-radius:4px;text-decoration:none;">⬇ Download</a>
        </div>
      </div>`;
    }
    if (state.active === "images") {
      return `<div class="item" style="display:flex;gap:10px;align-items:flex-start;">
        <a href="${escapeAttr(it.url)}" target="_blank" rel="noopener"><img src="${escapeAttr(it.url)}" style="width:100px;height:100px;object-fit:cover;border-radius:4px;flex-shrink:0;background:#eef3f6;" /></a>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;">${escapeHtml(it.title || "Image")}</div>
          <div class="meta">${it.width || "?"}×${it.height || "?"} • ${escapeHtml(it.url)}</div>
          <div style="margin-top:6px;"><a href="${escapeAttr(it.url)}" target="_blank" rel="noopener" download style="font-size:11px;padding:3px 8px;background:#14b8a6;color:#fff;border-radius:4px;text-decoration:none;">⬇ Open</a></div>
        </div>
      </div>`;
    }
    const sub = it.source ? `${it.source} • ` : "";
    return `<div class="item"><a href="${escapeAttr(it.url)}" target="_blank" rel="noopener">${escapeHtml(it.title || it.url)}</a><div class="meta">${sub}${escapeHtml(it.url)}</div></div>`;
  }).join("");

  list.querySelectorAll(".play-inline").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const embed = e.currentTarget.getAttribute("data-embed");
      const wrap = e.currentTarget.parentElement;
      const existing = wrap.querySelector("iframe");
      if (existing) { existing.remove(); return; }
      const iframe = document.createElement("iframe");
      iframe.src = embed;
      iframe.width = "100%";
      iframe.height = "180";
      iframe.style.cssText = "margin-top:6px;border:0;border-radius:4px;";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture";
      iframe.allowFullscreen = true;
      wrap.appendChild(iframe);
    });
  });
}

function normalizeScrapeResult(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Scraper did not return data. Reload the Moodle page, then click Scrape again.");
  }
  return {
    meta: data.meta || { url: "", title: "", scrapedAt: new Date().toISOString(), selectionOnly: false },
    text: Array.isArray(data.text) ? data.text : [],
    videos: Array.isArray(data.videos) ? data.videos : [],
    documents: Array.isArray(data.documents) ? data.documents : [],
    links: Array.isArray(data.links) ? data.links : [],
  };
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    state.active = t.dataset.tab;
    render();
  });
});

$("scrape").addEventListener("click", runScrape);

$("copy").addEventListener("click", async () => {
  if (!state.data) return;
  await navigator.clipboard.writeText(JSON.stringify(state.data, null, 2));
  $("status").textContent = "Copied JSON to clipboard.";
});

$("download").addEventListener("click", () => {
  if (!state.data) return;
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const name = `moodle-scrape-${Date.now()}.json`;
  chrome.downloads.download({ url, filename: name, saveAs: true });
});