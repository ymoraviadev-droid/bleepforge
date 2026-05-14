// Fetch the most recent release from GitHub and update the download buttons
// + version chip in place. Falls back to the hardcoded hrefs in index.html
// if the fetch fails (anonymous rate-limit, offline, repo private, etc.).
//
// Uses /releases?per_page=1 instead of /releases/latest so pre-releases
// (everything with a -dev suffix) also count — /latest only points at the
// most recent non-pre-release tag.

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

  // Download buttons: walk assets, match by extension, swap href + size meta.
  for (const asset of release.assets ?? []) {
    const name = (asset.name ?? "").toLowerCase();
    if (name.endsWith(".exe")) {
      setDownload("download-windows", asset, "installer");
    } else if (name.endsWith(".appimage")) {
      setDownload("download-linux", asset, "AppImage");
    }
  }
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

updateDownloads();
