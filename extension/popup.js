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
      return `<div class="item">${it.heading ? `<div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#0f172a;">${escapeHtml(it.heading)}</div>` : ""}<div class="body" style="white-space:pre-wrap;line-height:1.5;">${escapeHtml(it.body)}</div></div>`;
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
      const name = getDownloadName(it.url, "image");
      return `<div class="item" style="display:flex;gap:10px;align-items:flex-start;">
        <a href="${escapeAttr(it.url)}" target="_blank" rel="noopener"><img src="${escapeAttr(it.url)}" style="width:100px;height:100px;object-fit:cover;border-radius:4px;flex-shrink:0;background:#eef3f6;" /></a>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;">${escapeHtml(it.title || "Image")}</div>
          <div class="meta">${it.width || "?"}×${it.height || "?"} • ${escapeHtml(it.url)}</div>
          <div style="margin-top:6px;display:flex;gap:6px;">
            <a href="${escapeAttr(it.url)}" target="_blank" rel="noopener" style="font-size:11px;padding:3px 8px;border:1px solid #14b8a6;color:#0f766e;border-radius:4px;text-decoration:none;">👁 View</a>
            <a href="${escapeAttr(it.url)}" download="${escapeAttr(name)}" target="_blank" rel="noopener" style="font-size:11px;padding:3px 8px;background:#14b8a6;color:#fff;border-radius:4px;text-decoration:none;">⬇ Download</a>
            <button data-img-dl="${escapeAttr(it.url)}" data-filename="${escapeAttr(name)}" class="img-dl" style="font-size:11px;padding:3px 8px;background:#0f766e;color:#fff;border:0;border-radius:4px;cursor:pointer;">Save</button>
          </div>
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

  list.querySelectorAll(".img-dl").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const url = e.currentTarget.getAttribute("data-img-dl");
      const name = e.currentTarget.getAttribute("data-filename") || getDownloadName(url, "image");
      try {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) throw new Error("Image download failed");
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        chrome.downloads.download({ url: objUrl, filename: name, saveAs: true });
      } catch {
        // Fallback: let Chrome's downloader fetch it directly.
        chrome.downloads.download({ url, filename: name, saveAs: true });
      }
    });
  });
}

function getDownloadName(url, fallback) {
  try {
    const u = new URL(url);
    const pathName = decodeURIComponent((u.pathname.split("/").pop() || "").trim());
    if (pathName && /\.[a-z0-9]{2,5}$/i.test(pathName)) return pathName.replace(/[^a-z0-9._-]/gi, "-");
  } catch {}
  return `${fallback || "file"}-${Date.now()}.jpg`;
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
    images: Array.isArray(data.images) ? data.images : [],
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

$("downloadContent").addEventListener("click", downloadContentBundle);

async function downloadContentBundle() {
  if (!state.data) return;
  const btn = $("downloadContent");
  btn.disabled = true;
  const status = $("status");
  status.textContent = "Packaging content...";
  try {
    const d = state.data;
    const zip = new JSZip();
    const safe = (s) => String(s || "").replace(/[\\/:*?"<>|\n\r\t]+/g, "_").slice(0, 120);
    const host = (() => { try { return new URL(d.meta.url).hostname; } catch { return "moodle"; } })();
    const folderName = `moodle-${safe(d.meta.title || host)}-${Date.now()}`;
    const root = zip.folder(folderName);

    // --- text.txt (clean readable) ---
    const textLines = [];
    textLines.push(d.meta.title || "");
    textLines.push(d.meta.url || "");
    textLines.push("Scraped: " + (d.meta.scrapedAt || ""));
    textLines.push("=".repeat(60), "");
    d.text.forEach((t) => {
      if (t.heading) textLines.push(t.heading, "-".repeat(t.heading.length));
      textLines.push(t.body, "");
    });
    root.file("text.txt", textLines.join("\n"));
    // text.doc — Word opens HTML with .doc extension cleanly.
    root.file("text.doc", buildWordHtml(d));

    // --- videos.txt / links.txt ---
    if (d.videos.length) {
      root.file("videos.txt", d.videos.map((v) =>
        `${v.title || "(untitled)"}\n  Provider: ${v.provider || v.source}\n  URL: ${v.url}${v.embedUrl && v.embedUrl !== v.url ? `\n  Embed: ${v.embedUrl}` : ""}\n`
      ).join("\n"));
    }
    if (d.links.length) {
      root.file("links.txt", d.links.map((l) => `${l.title || l.url}\n  ${l.url}\n`).join("\n"));
    }

    // index.json always
    root.file("index.json", JSON.stringify(d, null, 2));

    // --- images/ ---
    const imgFolder = d.images.length ? root.folder("images") : null;
    const docFolder = d.documents.length ? root.folder("documents") : null;
    const failures = [];
    const used = new Set();
    const uniqName = (base) => {
      let n = base, i = 1;
      while (used.has(n)) { const dot = base.lastIndexOf("."); n = dot > 0 ? `${base.slice(0,dot)}-${i}${base.slice(dot)}` : `${base}-${i}`; i++; }
      used.add(n); return n;
    };

    let done = 0;
    const total = d.images.length + d.documents.length;
    const tick = (label) => { done++; status.textContent = `Downloading ${done}/${total}: ${label}`; };

    for (const img of d.images) {
      const name = uniqName(safe(getDownloadName(img.url, "image")));
      try {
        const blob = await (await fetch(img.url, { mode: "cors", credentials: "include" })).blob();
        imgFolder.file(name, blob);
      } catch (e) { failures.push(`image: ${img.url}`); }
      tick(name);
    }
    for (const doc of d.documents) {
      const url = doc.url + (doc.url.includes("?") ? "&" : "?") + "forcedownload=1";
      const fallback = `${safe(doc.title || "document")}.${(doc.ext || "pdf").toLowerCase()}`;
      const name = uniqName(safe(getDownloadName(doc.url, "document") || fallback));
      try {
        const res = await fetch(url, { mode: "cors", credentials: "include" });
        if (!res.ok) throw new Error(res.status);
        docFolder.file(name, await res.blob());
      } catch (e) { failures.push(`document: ${doc.url}`); }
      tick(name);
    }

    if (failures.length) {
      root.file("FAILED.txt", "Could not fetch these resources (CORS or auth):\n\n" + failures.join("\n"));
    }

    status.textContent = "Building zip...";
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    chrome.downloads.download({ url, filename: `${folderName}.zip`, saveAs: true });
    status.textContent = `Done. ${total - failures.length}/${total} files saved${failures.length ? `, ${failures.length} failed` : ""}.`;
  } catch (e) {
    console.error(e);
    status.textContent = "Error: " + (e.message || e);
  } finally {
    btn.disabled = false;
  }
}

function buildWordHtml(d) {
  const esc = (s) => escapeHtml(s).replace(/\n/g, "<br/>");
  const parts = [
    `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>`,
    `<head><meta charset='utf-8'><title>${escapeHtml(d.meta.title || "Moodle content")}</title></head><body>`,
    `<h1>${escapeHtml(d.meta.title || "")}</h1>`,
    `<p style='color:#666'>${escapeHtml(d.meta.url || "")}</p><hr/>`,
  ];
  d.text.forEach((t) => {
    if (t.heading) parts.push(`<h2>${escapeHtml(t.heading)}</h2>`);
    parts.push(`<p>${esc(t.body)}</p>`);
  });
  if (d.videos.length) {
    parts.push(`<h2>Videos</h2><ul>`);
    d.videos.forEach((v) => parts.push(`<li><a href='${escapeAttr(v.url)}'>${escapeHtml(v.title || v.url)}</a> (${escapeHtml(v.provider || "")})</li>`));
    parts.push(`</ul>`);
  }
  if (d.links.length) {
    parts.push(`<h2>Links</h2><ul>`);
    d.links.forEach((l) => parts.push(`<li><a href='${escapeAttr(l.url)}'>${escapeHtml(l.title || l.url)}</a></li>`));
    parts.push(`</ul>`);
  }
  parts.push(`</body></html>`);
  return parts.join("\n");
}