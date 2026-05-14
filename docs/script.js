// Fetch the most recent release from GitHub and update the download buttons,
// version chip, and release-notes block in place. Falls back gracefully to
// the hardcoded hrefs in index.html if the fetch fails.
//
// Uses /releases?per_page=1 instead of /releases/latest so pre-releases
// (everything with a -dev suffix) also count.

const REPO = "ymoraviadev-droid/bleepforge";
const API = `https://api.github.com/repos/${REPO}/releases?per_page=1`;

async function updateDownloads() {
  let releases;
  try {
    const r = await fetch(API);
    if (!r.ok) return;
    releases = await r.json();
  } catch {
    return;
  }
  if (!Array.isArray(releases) || releases.length === 0) return;
  const release = releases[0];

  // Version chip: "v0.2.3-dev · preview" for pre-releases, "v0.2.3" otherwise.
  const chip = document.getElementById("version-chip");
  if (chip && release.tag_name) {
    const tag = release.tag_name.replace(/^v/, "");
    const isPreview = release.prerelease || tag.includes("-");
    chip.textContent = isPreview ? `v${tag} · preview` : `v${tag}`;
  }

  // Download buttons.
  for (const asset of release.assets ?? []) {
    const name = (asset.name ?? "").toLowerCase();
    if (name.endsWith(".exe")) {
      setDownload("download-windows", asset, "installer");
    } else if (name.endsWith(".appimage")) {
      setDownload("download-linux", asset, "AppImage");
    }
  }

  // Release notes block.
  renderReleaseNotes(release);
}

function setDownload(btnId, asset, kind) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.href = asset.browser_download_url;
  const sizeMb = Math.round((asset.size ?? 0) / 1024 / 1024);
  const meta = btn.querySelector(".meta-size");
  if (meta && sizeMb > 0) {
    meta.textContent =
      kind === "installer"
        ? `.exe installer · ${sizeMb} MB`
        : `${kind} · ${sizeMb} MB`;
  }
}

function renderReleaseNotes(release) {
  const section = document.getElementById("release-notes");
  const titleEl = document.getElementById("release-title");
  const dateEl = document.getElementById("release-date");
  const linkEl = document.getElementById("release-link");
  const bodyEl = document.getElementById("release-body");
  if (!section || !bodyEl) return;

  const title = release.name || release.tag_name || "Latest release";
  const date = release.published_at ? formatDate(release.published_at) : "";
  const body = (release.body || "").trim();

  if (titleEl) titleEl.textContent = title;
  if (dateEl) dateEl.textContent = date;
  if (linkEl && release.html_url) linkEl.href = release.html_url;
  bodyEl.innerHTML = body
    ? renderMarkdown(body)
    : "<p><em>No release notes for this build.</em></p>";

  // Make any links inside the rendered notes open in a new tab.
  bodyEl.querySelectorAll("a[href]").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener";
  });

  section.hidden = false;
  // The release-notes section is `hidden` at page load, so the
  // IntersectionObserver may not have a useful initial reading. Add
  // .in-view explicitly here so the fade-in always plays once we have
  // content to show.
  section.classList.add("in-view");
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Render markdown via the `marked` library (loaded from CDN in index.html).
// If the CDN failed to load for any reason, fall back to escaped plain text
// inside a <pre> so the notes are still readable.
function renderMarkdown(src) {
  if (typeof marked !== "undefined" && typeof marked.parse === "function") {
    return marked.parse(src, { breaks: true, gfm: true });
  }
  const escaped = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre>${escaped}</pre>`;
}

// Scroll-fade for sections. Each <section> starts hidden (opacity 0,
// translateY 14px in CSS) and flips to .in-view when at least 15% of
// its bounding box enters the viewport. Once visible it stays visible —
// we unobserve the element so re-scrolling past doesn't re-trigger.
//
// Honors `prefers-reduced-motion`: the CSS rule kills all transitions
// for those users, so the static end-state shows immediately regardless
// of the observer. We still flip the class so the layout matches the
// reduced-motion path.
function setupScrollFade() {
  const sections = document.querySelectorAll("section:not(.hero)");
  if (!("IntersectionObserver" in window) || sections.length === 0) {
    // Old browser or no sections — reveal everything immediately.
    sections.forEach((el) => el.classList.add("in-view"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -50px 0px" },
  );
  sections.forEach((el) => observer.observe(el));
}

// Mark the page as JS-active so the CSS knows to run the scroll-fade.
// Without this class, sections render visible from frame 1 — guarantees
// no blank page if the script fails to load for any reason.
document.documentElement.classList.add("js-ready");

updateDownloads();
setupScrollFade();