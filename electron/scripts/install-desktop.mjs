#!/usr/bin/env node
// Linux desktop integration for the Bleepforge AppImage.
//
// Why this exists: AppImages ship their icon embedded in the squashfs
// (9 sizes from 16 to 1024 inside `usr/share/icons/hicolor/`), but
// neither KDE Plasma nor GNOME extract it on their own. Without help,
// Bleepforge:
//   - shows as a generic-AppImage file in Dolphin / Nautilus
//   - doesn't appear in the KDE menu / GNOME activities / app search
//   - uses a generic Electron icon in the taskbar when running
//
// This script does the integration in three complementary ways:
//
//   1. XDG icon theme registration — copies hicolor PNGs to
//      ~/.local/share/icons/hicolor/<size>/apps/bleepforge.png
//   2. .desktop launcher entry — ~/.local/share/applications/
//      bleepforge.desktop so the app appears in menus
//   3. Per-file thumbnail pre-cache — writes spec-conformant PNGs to
//      ~/.cache/thumbnails/{normal,large}/<md5>.png for every AppImage
//      in release/, so file managers show the embedded icon as the
//      file thumbnail (the freedesktop Thumbnail Managing Standard
//      mechanism — KIO reads this cache directly when a thumbnailer
//      plugin exists for the MIME, but the cache also serves bare
//      since Plasma 6.6's XDG-thumbnailer bridge counts our shipped
//      .thumbnailer file as a registered plugin).
//
// Run this once after `pnpm dist`. Re-run after subsequent builds so
// the .desktop Exec line + thumbnail entries point at the new AppImage.
//
// After install completes: CLOSE and REOPEN Dolphin (Ctrl+Q, then
// re-launch). F5 / refresh is not enough — Dolphin caches its
// thumbnail-lookup decisions in-process, and only a full restart
// makes it re-check the cache for files it already classified as
// "no preview available". Confirmed in Plasma 6.6.4 on Fedora 44.
//
// All writes are user-local (~/.local/share, ~/.cache) — no sudo,
// no system pollution.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(here, "..");
const home = os.homedir();

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const APPIMAGE_NAME_RE = /^Bleepforge-.*\.AppImage$/i;

function findLatestAppImage() {
  const releaseDir = path.join(electronRoot, "release");
  if (!fs.existsSync(releaseDir)) {
    throw new Error(`No release dir at ${releaseDir}. Run \`pnpm dist\` first.`);
  }
  const candidates = fs.readdirSync(releaseDir)
    .filter((f) => APPIMAGE_NAME_RE.test(f))
    .map((f) => {
      const p = path.join(releaseDir, f);
      return { name: f, path: p, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    throw new Error(
      "No AppImage found in electron/release/. Run `pnpm dist` first.",
    );
  }
  return candidates[0];
}

function copyIcons() {
  const srcDir = path.join(electronRoot, "build-resources", "icons");
  let copied = 0;
  for (const size of ICON_SIZES) {
    const src = path.join(srcDir, `${size}x${size}.png`);
    if (!fs.existsSync(src)) {
      console.warn(`[install:desktop] missing ${src}, skipping`);
      continue;
    }
    const destDir = path.join(
      home,
      ".local",
      "share",
      "icons",
      "hicolor",
      `${size}x${size}`,
      "apps",
    );
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, path.join(destDir, "bleepforge.png"));
    copied++;
  }
  console.log(`[install:desktop] copied ${copied} icon size(s) to ~/.local/share/icons/hicolor/`);
}

function writeDesktopEntry(appImagePath) {
  const desktopDir = path.join(home, ".local", "share", "applications");
  fs.mkdirSync(desktopDir, { recursive: true });
  const desktopFile = path.join(desktopDir, "bleepforge.desktop");
  // StartupWMClass matches the BrowserWindow's title-derived class.
  // Categories=Development; matches the AppImage's internal .desktop so
  // both routes (run-from-menu vs run-from-file-manager) classify the
  // app the same way.
  const contents = `[Desktop Entry]
Name=Bleepforge
Comment=Schema-driven content authoring studio for Godot projects
Exec=${appImagePath} %U
Terminal=false
Type=Application
Icon=bleepforge
StartupWMClass=Bleepforge
Categories=Development;
`;
  fs.writeFileSync(desktopFile, contents);
  console.log(`[install:desktop] wrote ${desktopFile}`);
  console.log(`[install:desktop]   Exec → ${appImagePath}`);
}

function ensureExecutable(p) {
  try {
    fs.chmodSync(p, 0o755);
  } catch (err) {
    console.warn(`[install:desktop] could not chmod ${p}: ${err.message}`);
  }
}

// Installs a user-local XDG thumbnailer that teaches Dolphin / Nautilus
// to extract the embedded icon from ANY AppImage (not just Bleepforge)
// and use it as the file thumbnail. The trick: Linux file managers
// support arbitrary thumbnailers via `.thumbnailer` files in
// ~/.local/share/thumbnailers/. Our thumbnailer registers for the
// `application/vnd.appimage` MIME type (which Fedora's shared-mime-info
// already maps to .AppImage files — confirmed via xdg-mime).
//
// The actual extraction is a tiny bash script that uses the AppImage's
// own --appimage-extract command to pull out `.DirIcon` (the AppImage
// spec's standard icon location, present in every conforming AppImage)
// and resizes it via ImageMagick to the thumbnail size the file manager
// requested. Two-step extract: .DirIcon is typically a symlink to the
// largest hicolor PNG inside the squashfs, so we extract the symlink
// first, readlink it, then extract the target.
//
// Why this beats installing libappimage / appimaged: zero system packages
// to install, works user-locally, and handles every AppImage on the
// system uniformly — Bleepforge plus any third-party AppImage gets a
// proper thumbnail in the file manager.
const THUMBNAILER_SCRIPT = `#!/usr/bin/env bash
# Bleepforge AppImage thumbnailer for XDG-conformant file managers.
# Args: \$1 input file (.AppImage), \$2 output thumb (PNG), \$3 size in px
#
# Installed by Bleepforge's \`pnpm install:desktop\`. The Exec line of
# ~/.local/share/thumbnailers/bleepforge-appimage.thumbnailer points
# here. Works for ANY AppImage, not just Bleepforge.

set -euo pipefail
INPUT="\$1"
OUTPUT="\$2"
SIZE="\${3:-256}"

[ -x "\$INPUT" ] || exit 1
command -v magick >/dev/null 2>&1 || exit 1

WORK=\$(mktemp -d)
trap 'rm -rf "\$WORK"' EXIT
cd "\$WORK"

# Step 1: extract .DirIcon (typically a symlink to the largest icon).
"\$INPUT" --appimage-extract '.DirIcon' >/dev/null 2>&1 || exit 1
ICON="\$WORK/squashfs-root/.DirIcon"
# Symlink check first — \`-e\` returns false on broken symlinks, but
# .DirIcon at this point IS a broken symlink (its target wasn't
# extracted in this pass), so \`-e\` would fail. Use \`-L\` for the
# symlink case and \`-f\` for the rare regular-file case.
if [ -L "\$ICON" ]; then
  TARGET=\$(readlink "\$ICON")
  rm -rf "\$WORK/squashfs-root"
  cd "\$WORK"
  "\$INPUT" --appimage-extract "\$TARGET" >/dev/null 2>&1 || exit 1
  ICON="\$WORK/squashfs-root/\$TARGET"
elif [ ! -f "\$ICON" ]; then
  exit 1
fi

[ -f "\$ICON" ] || exit 1
magick "\$ICON" -resize "\${SIZE}x\${SIZE}" "\$OUTPUT" 2>/dev/null
`;

function installAppImageThumbnailer() {
  const dataDir = path.join(home, ".local", "share", "bleepforge");
  fs.mkdirSync(dataDir, { recursive: true });
  const scriptPath = path.join(dataDir, "appimage-thumbnailer.sh");
  fs.writeFileSync(scriptPath, THUMBNAILER_SCRIPT);
  fs.chmodSync(scriptPath, 0o755);
  console.log(`[install:desktop] wrote ${scriptPath}`);

  const thumbDir = path.join(home, ".local", "share", "thumbnailers");
  fs.mkdirSync(thumbDir, { recursive: true });
  const thumbFile = path.join(thumbDir, "bleepforge-appimage.thumbnailer");
  // TryExec gates the thumbnailer on `magick` being available; missing
  // ImageMagick → thumbnailer silently disabled, file manager falls
  // back to generic icon (same as before this script ran).
  const contents = `[Thumbnailer Entry]
TryExec=magick
Exec=${scriptPath} %i %o %s
MimeType=application/vnd.appimage;application/x-iso9660-appimage;
`;
  fs.writeFileSync(thumbFile, contents);
  console.log(`[install:desktop] wrote ${thumbFile}`);
}

// Pre-cache thumbnails for every AppImage in release/ under the
// freedesktop Thumbnail Managing Standard. Without this, Dolphin
// shows the generic application/vnd.appimage MIME icon for AppImage
// files even though their embedded icons are correct — KDE's
// kio-extras is built on Fedora without libappimage, so KIO has no
// plugin registered for AppImages and never even checks for cached
// thumbnails on its own. Pre-populating the cache with spec-conformant
// PNGs (8-bit non-interlaced, proper tEXt::Thumb::URI + Thumb::MTime
// chunks) makes Dolphin display them once it does a thumbnail lookup.
//
// Crucial Dolphin behavior: after writing the cache, you must
// **close and reopen Dolphin** (Ctrl+Q + relaunch). F5 doesn't work
// — Dolphin caches its thumbnail-lookup decisions in-process and
// won't re-check until full restart. Confirmed on Plasma 6.6.4.
function precacheAppImageThumbnails() {
  const releaseDir = path.join(electronRoot, "release");
  if (!fs.existsSync(releaseDir)) {
    console.warn("[install:desktop] no release/ dir, skipping thumbnail pre-cache");
    return;
  }
  const appImages = fs.readdirSync(releaseDir)
    .filter((f) => /\.AppImage$/i.test(f))
    .map((f) => path.join(releaseDir, f));
  if (appImages.length === 0) {
    console.warn("[install:desktop] no .AppImage files in release/, skipping thumbnail pre-cache");
    return;
  }

  const normalDir = path.join(home, ".cache", "thumbnails", "normal");
  const largeDir = path.join(home, ".cache", "thumbnails", "large");
  fs.mkdirSync(normalDir, { recursive: true });
  fs.mkdirSync(largeDir, { recursive: true });

  const thumbScript = path.join(home, ".local", "share", "bleepforge", "appimage-thumbnailer.sh");
  if (!fs.existsSync(thumbScript)) {
    console.warn(`[install:desktop] thumbnailer script missing at ${thumbScript}, skipping pre-cache`);
    return;
  }

  let cached = 0;
  for (const appImagePath of appImages) {
    const url = `file://${appImagePath}`;
    const hash = crypto.createHash("md5").update(url).digest("hex");
    const stat = fs.statSync(appImagePath);
    const mtime = Math.floor(stat.mtimeMs / 1000);
    const size = stat.size;

    const tmpIcon = path.join(os.tmpdir(), `bf-precache-${hash}.png`);
    const extract = spawnSync("bash", [thumbScript, appImagePath, tmpIcon, "256"]);
    if (extract.status !== 0 || !fs.existsSync(tmpIcon)) {
      console.warn(`[install:desktop] couldn't extract icon from ${path.basename(appImagePath)}, skipping`);
      continue;
    }

    // Common tEXt metadata for both sizes. The freedesktop Thumbnail
    // Managing Standard requires Thumb::URI + Thumb::MTime at minimum;
    // Thumb::Size + Thumb::Mimetype are recommended.
    const meta = [
      "-set", "Thumb::URI", url,
      "-set", "Thumb::MTime", String(mtime),
      "-set", "Thumb::Size", String(size),
      "-set", "Thumb::Mimetype", "application/vnd.appimage",
    ];

    const largePath = path.join(largeDir, `${hash}.png`);
    const normalPath = path.join(normalDir, `${hash}.png`);
    const rLarge = spawnSync("magick", [tmpIcon, ...meta, largePath]);
    const rNormal = spawnSync("magick", [tmpIcon, "-resize", "128x128", ...meta, normalPath]);
    fs.unlinkSync(tmpIcon);

    if (rLarge.status !== 0 || rNormal.status !== 0) {
      console.warn(`[install:desktop] magick failed on ${path.basename(appImagePath)}`);
      continue;
    }
    cached++;
  }
  console.log(`[install:desktop] pre-cached thumbnails for ${cached}/${appImages.length} AppImage(s) in ~/.cache/thumbnails/`);
}

function refreshCaches() {
  // Both tools are best-effort: if they're not installed, the desktop
  // environment will pick up the new files on next refresh / login
  // anyway. We just nudge it for an immediate effect.
  return new Promise((resolve) => {
    const commands = [
      [
        "gtk-update-icon-cache",
        ["-f", "-t", path.join(home, ".local", "share", "icons", "hicolor")],
      ],
      [
        "update-desktop-database",
        [path.join(home, ".local", "share", "applications")],
      ],
    ];
    let pending = commands.length;
    if (pending === 0) {
      resolve();
      return;
    }
    for (const [cmd, args] of commands) {
      const child = spawn(cmd, args, { stdio: "ignore" });
      child.on("error", () => {
        console.warn(`[install:desktop] ${cmd} not on PATH (ok — DE will pick up on next refresh)`);
        if (--pending === 0) resolve();
      });
      child.on("exit", (code) => {
        if (code === 0) console.log(`[install:desktop] refreshed via ${cmd}`);
        if (--pending === 0) resolve();
      });
    }
  });
}

async function main() {
  console.log("[install:desktop] starting Linux desktop integration…");
  const appImage = findLatestAppImage();
  console.log(`[install:desktop] latest AppImage: ${appImage.name}`);
  ensureExecutable(appImage.path);
  copyIcons();
  writeDesktopEntry(appImage.path);
  installAppImageThumbnailer();
  precacheAppImageThumbnails();
  await refreshCaches();
  console.log("");
  console.log("[install:desktop] done. Bleepforge now appears in your KDE / GNOME");
  console.log("[install:desktop] app menu with the proper icon, and every AppImage");
  console.log("[install:desktop] in release/ has a pre-cached file thumbnail.");
  console.log("");
  console.log("[install:desktop] NEXT STEP — close and reopen Dolphin (Ctrl+Q,");
  console.log("[install:desktop] then re-launch). F5 / refresh isn't enough:");
  console.log("[install:desktop] Dolphin caches its thumbnail-lookup decisions");
  console.log("[install:desktop] in-process and only re-reads the cache on a full");
  console.log("[install:desktop] restart. Confirmed on Plasma 6.6.4.");
}

main().catch((err) => {
  console.error("[install:desktop] failed:", err.message);
  process.exit(1);
});
