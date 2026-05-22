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
      ".tertiary-navigation, .moremenu"
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
  const currentHost = location.hostname.replace(/^www\./, "");
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href;
    if (!href || href.startsWith("javascript:") || href.startsWith("#")) return;
    if (knownUrls.has(href)) return;
    const text = (a.textContent || "").trim();
    if (!text && !a.querySelector("img")) return;
    // Only keep external links — internal Moodle navigation (same hostname)
    // is noise for the user.
    let host = "";
    try { host = new URL(href, location.href).hostname.replace(/^www\./, ""); } catch { return; }
    if (!host || host === currentHost) return;
    // Skip mailto/tel which have no hostname anyway (already filtered) and
    // common tracking/share endpoints.
    links.push({ type: "link", url: abs(href), title: text || href, source: host });
  });

  // -------- Text blocks --------
  // Build a cleaned clone of root: drop player chrome, replace embedded
  // media / attachments with short bracket placeholders, then group
  // paragraphs under their nearest heading.
  const textRoot = root.cloneNode(true);

  // Strip player UI, scripts, and noise that pollute innerText.
  textRoot.querySelectorAll(
    "script, style, noscript, " +
    ".accesshide, .sr-only, .visually-hidden, .visuallyhidden, [aria-hidden='true'], " +
    "[role='tablist'], .nav-tabs, .nav-pills, .secondary-navigation, .breadcrumb, .pagination, " +
    ".video-js .vjs-control-bar, .vjs-modal-dialog, .vjs-text-track-display, .vjs-control-text, " +
    "[class^='vjs-'], [class*=' vjs-']"
  ).forEach((n) => n.remove());

  const replaceWith = (el, label) => {
    if (!el || !el.parentNode) return;
    el.parentNode.replaceChild(document.createTextNode(` [${label}] `), el);
  };

  // Replace media embeds with a marker.
  textRoot.querySelectorAll("video, audio").forEach((el) => replaceWith(el, "Video here"));
  textRoot.querySelectorAll("iframe").forEach((el) => {
    const src = el.src || el.getAttribute("data-src") || "";
    replaceWith(el, videoHostRe.test(src) ? "Video here" : "Embedded content");
  });
  // Replace any container that *was* a video player but is now empty of media.
  textRoot.querySelectorAll(".video-js, [class*='video-player'], [class*='mediaplugin']").forEach((el) => {
    if (!el.querySelector("video,audio,iframe")) replaceWith(el, "Video here");
  });

  // Replace standalone images with [Image: alt].
  textRoot.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src || "";
    if (!src || /^data:/.test(src)) { replaceWith(img, "Image"); return; }
    if (/\/theme\/|\/pix\/|icon|logo|avatar/i.test(src)) { if (img.parentNode) img.parentNode.removeChild(img); return; }
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if ((w && w < 80) || (h && h < 80)) { if (img.parentNode) img.parentNode.removeChild(img); return; }
    const alt = (img.alt || "").trim();
    replaceWith(img, alt ? `Image: ${alt}` : "Image");
  });

  // Replace document / file / external links with bracket placeholders.
  const docUrls = new Set(documents.map((d) => d.url));
  const videoUrls = new Set(videos.map((v) => v.url));
  const linkUrls = new Set(links.map((l) => l.url));
  textRoot.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href;
    if (!href) return;
    const name = (a.textContent || "").replace(/\s+/g, " ").trim();
    const isDoc = docExtRe.test(href) || /\/mod\/(resource|folder|book)\/view\.php/.test(href) || docUrls.has(href) || docUrls.has(abs(href));
    if (isDoc) {
      const clean = (name || "file").replace(/\b(PDF|DOCX?|PPTX?|XLSX?|ZIP)\b\s*\d.*$/i, "$1").trim();
      replaceWith(a, `Attachment: ${clean}`);
      return;
    }
    if (videoHostRe.test(href) || videoUrls.has(href) || videoUrls.has(abs(href))) {
      replaceWith(a, name ? `Video: ${name}` : "Video here");
      return;
    }
    if (linkUrls.has(href) || linkUrls.has(abs(href))) {
      replaceWith(a, name ? `Link: ${name}` : "Link");
      return;
    }
  });

  const text = [];
  const seenBodies = new Set();
  const cleanInline = (s) => (s || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Walk in document order, grouping paragraphs/lists under the latest heading.
  let currentHeading = "";
  let buffer = [];
  const flush = () => {
    const body = cleanInline(buffer.join("\n\n"));
    buffer = [];
    if (!body) return;
    const key = (currentHeading + "||" + body).toLowerCase();
    if (seenBodies.has(key)) return;
    seenBodies.add(key);
    text.push({ type: "text", heading: currentHeading, body });
  };

  const blockSel = "h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,td";
  textRoot.querySelectorAll(blockSel).forEach((el) => {
    // Skip nested blocks — outer block's innerText already contains them.
    if (el.parentElement && el.parentElement.closest("p,li,blockquote,pre,figcaption")) return;
    const tag = el.tagName.toLowerCase();
    const raw = cleanInline(el.innerText || el.textContent || "");
    if (!raw) return;
    if (/^h[1-6]$/.test(tag)) {
      flush();
      currentHeading = raw;
      return;
    }
    if (tag === "li") {
      buffer.push("• " + raw);
    } else {
      buffer.push(raw);
    }
  });
  flush();

  // -------- Images (separate category) --------
  const images = [];
  const isVideoThumbnailImage = (rawSrc, img) => {
    const src = abs(rawSrc || "");
    if (!src) return false;
    // YouTube and similar players expose their posters as normal <img> tags
    // (for example img.youtube.com/vi/.../maxresdefault.jpg). Treat those as
    // video thumbnails, never as standalone images.
    if (/(^|\/\/)(i\.)?ytimg\.com|(^|\/\/)img\.youtube\.com|i\.vimeocdn\.com|vumbnail\.com|dailymotion\.com\/thumbnail|cdn\.loom\.com|kalturacdn|panopto|wistia|vidyard/i.test(src)) return true;
    if (/\/vi\/[a-z0-9_-]{6,}\/(maxresdefault|hqdefault|mqdefault|sddefault|default)\.(jpe?g|webp|png)(\?|$)/i.test(src)) return true;
    const linkParent = img && img.closest("a[href]");
    if (linkParent && videoHostRe.test(linkParent.href)) return true;
    if (img && img.closest("video, .video-js, [class*='video'], [class*='player'], [data-video], [data-youtube], [data-vimeo]")) return true;
    return false;
  };
  root.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src;
    if (!src) return;
    if (/^data:/.test(src)) return;
    // Skip tiny icons / Moodle UI sprites.
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if ((w && w < 80) || (h && h < 80)) return;
    if (/\/theme\/|\/pix\/|icon|logo|avatar/i.test(src)) return;
    // Skip video thumbnails (YouTube / Vimeo / etc.) and any <img> that sits
    // inside a link or figure pointing to a known video host — those belong
    // to the Videos tab, not Images.
    if (isVideoThumbnailImage(src, img)) return;
    images.push({ type: "image", url: abs(src), title: img.alt || "Image", width: w, height: h });
  });

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
    images: unique(images, "url"),
  };
})(SCRAPE_OPTS);