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
    const total = state.data.text.length + state.data.videos.length + state.data.documents.length + state.data.links.length;
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
    const sub = it.ext ? `${it.ext.toUpperCase()} • ` : it.source ? `${it.source} • ` : "";
    return `<div class="item"><a href="${escapeAttr(it.url)}" target="_blank" rel="noopener">${escapeHtml(it.title || it.url)}</a><div class="meta">${sub}${escapeHtml(it.url)}</div></div>`;
  }).join("");
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