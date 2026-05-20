import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const download = () => {
    fetch("/moodle-scraper.zip")
      .then((r) => {
        if (!r.ok) throw new Error("Download failed: " + r.status);
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "moodle-scraper.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((e) => alert(e.message));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white px-3 py-1 text-xs font-medium text-teal-700">
          Chrome / Edge / Brave extension
        </div>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
          Moodle Content <span className="text-teal-600">Scraper</span>
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Log in to your Moodle, open any course tab, and pull every piece of
          content into clean buckets: <b>text</b>, <b>videos</b>, <b>documents</b>, and <b>links</b>.
          Export as JSON in one click.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={download}
            className="rounded-lg bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            Download extension (.zip)
          </button>
          <a
            href="#install"
            className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Install instructions
          </a>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {[
            { t: "Text", d: "Labels, page bodies, section summaries — cleaned and deduped." },
            { t: "Videos", d: "HTML5 video, YouTube/Vimeo/Panopto/Kaltura iframes, direct .mp4 links." },
            { t: "Documents", d: "PDF, Word, PowerPoint, Excel, archives, plus Moodle resource links." },
            { t: "Links", d: "Every other external/internal URL on the page." },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-sm font-semibold text-teal-700">{f.t}</div>
              <div className="mt-1 text-sm text-slate-600">{f.d}</div>
            </div>
          ))}
        </div>

        <div id="install" className="mt-14 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Install in 30 seconds</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Download and <b>unzip</b> the file above.</li>
            <li>Open <code className="rounded bg-slate-100 px-1.5 py-0.5">chrome://extensions</code> in your browser.</li>
            <li>Turn on <b>Developer mode</b> (top-right toggle).</li>
            <li>Click <b>Load unpacked</b> and select the unzipped folder.</li>
            <li>Pin the extension, open your Moodle, click the icon → <b>Scrape this page</b>.</li>
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            Tip: select text on the Moodle page first, then check "selection only" in the popup to scrape just that region.
          </p>
        </div>

        <p className="mt-10 text-center text-xs text-slate-500">
          Works with lms.univ-cotedazur.fr and any other Moodle site you're logged into.
        </p>
      </div>
    </div>
  );
}
