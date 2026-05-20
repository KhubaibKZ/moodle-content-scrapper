// Injected into the Moodle page. Returns categorized content.
var __MOODLE_SCRAPER_RESULT__ = (function scrape(opts) {
  const selectionOnly = !!(opts && opts.selectionOnly);

  let root = document.body;
  if (selectionOnly) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      const frag = sel.getRangeAt(0).cloneContents();
      const wrap = document.createElement("div");
      wrap.appendChild(frag);
      root = wrap;
    }
  }

  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
  const unique = (arr, key) => {
    const seen = new Set();
    return arr.filter((x) => {
      const k = key ? x[key] : x;
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  // -------- Videos --------
  const videos = [];
  root.querySelectorAll("video").forEach((v) => {
    const src = v.currentSrc || v.src || (v.querySelector("source") && v.querySelector("source").src);
    if (src) videos.push({ type: "video", source: "html5", url: abs(src), title: v.title || "" });
  });
  const videoHostRe = /(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|wistia\.|loom\.com|panopto\.|kaltura\.|mediaspace|video\.|vidyard\.|twitch\.tv|stream\.)/i;
  root.querySelectorAll("iframe").forEach((f) => {
    const src = f.src || f.getAttribute("data-src") || "";
    if (src && videoHostRe.test(src)) {
      videos.push({ type: "video", source: "iframe", url: abs(src), title: f.title || "" });
    }
  });
  root.querySelectorAll('a[href$=".mp4"], a[href$=".webm"], a[href$=".mov"], a[href$=".m4v"], a[href*="youtube.com/watch"], a[href*="youtu.be/"], a[href*="vimeo.com/"]').forEach((a) => {
    videos.push({ type: "video", source: "link", url: abs(a.href), title: (a.textContent || "").trim() });
  });

  // -------- Documents --------
  const docExt = ["pdf","doc","docx","ppt","pptx","xls","xlsx","odt","ods","odp","rtf","txt","csv","epub","zip","rar","7z","tex"];
  const docExtRe = new RegExp("\\.(" + docExt.join("|") + ")(\\?.*)?$", "i");
  const documents = [];
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href;
    if (!href) return;
    const text = (a.textContent || "").trim();
    // Moodle resource pages — /mod/resource/view.php often serves a file.
    const isMoodleResource = /\/mod\/(resource|folder|book)\/view\.php/.test(href);
    if (docExtRe.test(href) || isMoodleResource) {
      // try to detect extension from text or icon class
      let ext = (href.match(docExtRe) || [])[1] || "";
      if (!ext) {
        const icon = a.querySelector("img");
        const cls = (icon && (icon.getAttribute("src") || icon.className)) || "";
        const m = cls.match(/(pdf|word|powerpoint|excel|document|spreadsheet|presentation|archive)/i);
        if (m) ext = m[1].toLowerCase();
      }
      documents.push({ type: "document", ext: ext || "unknown", url: abs(href), title: text || href });
    }
  });

  // -------- Links (everything else external/internal that isn't doc/video) --------
  const knownUrls = new Set([...videos.map((v) => v.url), ...documents.map((d) => d.url)]);
  const links = [];
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href;
    if (!href || href.startsWith("javascript:") || href.startsWith("#")) return;
    if (knownUrls.has(href)) return;
    const text = (a.textContent || "").trim();
    if (!text && !a.querySelector("img")) return;
    links.push({ type: "link", url: abs(href), title: text || href });
  });

  // -------- Text blocks --------
  // Prefer Moodle content containers; fall back to article/main.
  const text = [];
  const seenText = new Set();
  const pushText = (heading, body) => {
    const t = (body || "").replace(/\s+/g, " ").trim();
    if (!t || t.length < 20) return;
    if (seenText.has(t)) return;
    seenText.add(t);
    text.push({ type: "text", heading: (heading || "").trim(), body: t });
  };

  const textSelectors = [
    ".course-content .summary",
    ".course-content .section .content",
    ".activityinstance + .contentafterlink",
    ".no-overflow",            // Moodle label/page content
    ".box.generalbox",
    "[role='main'] article",
    "[role='main'] section",
    "main article",
  ];
  const candidates = root.querySelectorAll(textSelectors.join(","));
  if (candidates.length) {
    candidates.forEach((el) => {
      const h = el.querySelector("h1,h2,h3,h4");
      pushText(h ? h.textContent : "", el.innerText || el.textContent || "");
    });
  } else {
    // fallback: page paragraphs
    const main = root.querySelector("[role='main'], main") || root;
    main.querySelectorAll("h1,h2,h3,h4,p,li").forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const t = (el.innerText || el.textContent || "").trim();
      if (!t) return;
      if (/^h[1-4]$/.test(tag)) pushText(t, "");
      else pushText("", t);
    });
  }

  return {
    meta: {
      url: location.href,
      title: document.title,
      scrapedAt: new Date().toISOString(),
      selectionOnly,
    },
    text,
    videos: unique(videos, "url"),
    documents: unique(documents, "url"),
    links: unique(links, "url"),
  };
})(SCRAPE_OPTS);