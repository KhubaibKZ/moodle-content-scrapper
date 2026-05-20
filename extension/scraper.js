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
  } else {
    // Restrict to the actual course/page content. Moodle pages are full of
    // navigation, blocks, footer links, breadcrumbs, "jump to" menus etc.
    // Without this we end up scraping the whole chrome of the LMS.
    const mainSel = [
      "#region-main .course-content",
      "#region-main [role='main']",
      "#region-main",
      "[role='main']",
      "main",
    ];
    for (const s of mainSel) {
      const el = document.querySelector(s);
      if (el) { root = el; break; }
    }
    // Strip side blocks / nav / footer that may live inside region-main on
    // some Moodle themes.
    const clone = root.cloneNode(true);
    clone.querySelectorAll(
      "nav, header, footer, .navbar, .breadcrumb, .secondary-navigation, " +
      ".block, [id^='block-region-'], [data-region='blocks-column'], " +
      ".activity-navigation, .jumpmenu, .single_select, .activity-information, " +
      ".tertiary-navigation, .moremenu, .activity-altcontent"
    ).forEach((n) => n.remove());
    root = clone;
  }

  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
  // Force Moodle resource pages to serve the underlying file directly.
  const directMoodleFile = (href) => {
    try {
      const u = new URL(href, location.href);
      if (/\/mod\/resource\/view\.php$/.test(u.pathname)) {
        u.searchParams.set("redirect", "1");
        return u.href;
      }
    } catch {}
    return href;
  };
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
  const normalizeVideo = (rawUrl, source, title) => {
    const url = abs(rawUrl);
    let provider = "other", id = "", watchUrl = url, embedUrl = url, thumbnail = "";
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      // YouTube
      if (/youtube\.com$/.test(host) || host === "youtu.be" || host.endsWith(".youtube.com")) {
        provider = "youtube";
        if (host === "youtu.be") id = u.pathname.slice(1);
        else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] || "";
        else if (u.pathname.startsWith("/watch")) id = u.searchParams.get("v") || "";
        else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] || "";
        if (id) {
          watchUrl = `https://www.youtube.com/watch?v=${id}`;
          embedUrl = `https://www.youtube.com/embed/${id}`;
          thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        }
      } else if (/vimeo\.com$/.test(host) || host.endsWith(".vimeo.com")) {
        provider = "vimeo";
        const m = u.pathname.match(/(?:\/video)?\/(\d+)/);
        if (m) {
          id = m[1];
          watchUrl = `https://vimeo.com/${id}`;
          embedUrl = `https://player.vimeo.com/video/${id}`;
        }
      } else if (host.includes("dailymotion.com") || host === "dai.ly") {
        provider = "dailymotion";
      } else if (host.includes("loom.com")) {
        provider = "loom";
      } else if (host.includes("panopto")) {
        provider = "panopto";
      } else if (host.includes("kaltura") || host.includes("mediaspace")) {
        provider = "kaltura";
      } else if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(u.pathname)) {
        provider = "file";
      }
    } catch {}
    return { type: "video", source, provider, id, url: watchUrl, embedUrl, thumbnail, title: title || "" };
  };

  root.querySelectorAll("video").forEach((v) => {
    const src = v.currentSrc || v.src || (v.querySelector("source") && v.querySelector("source").src);
    if (src) videos.push(normalizeVideo(src, "html5", v.title || ""));
  });
  const videoHostRe = /(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|wistia\.|loom\.com|panopto\.|kaltura\.|mediaspace|video\.|vidyard\.|twitch\.tv|stream\.)/i;
  root.querySelectorAll("iframe").forEach((f) => {
    const src = f.src || f.getAttribute("data-src") || "";
    if (src && videoHostRe.test(src)) {
      videos.push(normalizeVideo(src, "iframe", f.title || ""));
    }
  });
  root.querySelectorAll('a[href$=".mp4"], a[href$=".webm"], a[href$=".mov"], a[href$=".m4v"], a[href*="youtube.com/watch"], a[href*="youtu.be/"], a[href*="vimeo.com/"]').forEach((a) => {
    videos.push(normalizeVideo(a.href, "link", (a.textContent || "").trim()));
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
      const finalUrl = isMoodleResource ? directMoodleFile(abs(href)) : abs(href);
      // Clean up Moodle's noisy link text ("Foo PDF1.3 Mo" etc.)
      const cleanTitle = (text || href)
        .replace(/\s+/g, " ")
        .replace(/\b(PDF|DOCX?|PPTX?|XLSX?|ZIP)\b\s*\d.*$/i, "$1")
        .trim();
      documents.push({ type: "document", ext: ext || "unknown", url: finalUrl, title: cleanTitle });
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