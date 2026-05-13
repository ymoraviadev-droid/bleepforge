#!/usr/bin/env node
// Linux desktop integration for the Bleepforge AppImage.
//
// Why this exists: KDE Plasma, GNOME, Cinnamon, etc. don't auto-extract
// the icons + .desktop metadata that ship INSIDE an AppImage. The icon
// IS there (9 sizes from 16 to 1024 inside the squashfs), but the desktop
// only sees it after we copy the icon to a hicolor-theme location AND
// write a .desktop file that references it. Without this, Bleepforge:
//   - shows as a generic executable in Dolphin / Nautilus
//   - doesn't appear in the KDE menu / GNOME activities / app search
//   - uses a generic Electron icon in the taskbar when running
//
// This script does it once. After it runs, Bleepforge behaves like a
// natively-installed app. Re-run after each `pnpm dist` if the AppImage
// filename changes (e.g. version bump) so the .desktop entry points at
// the latest binary.
//
// What it touches (XDG user-local — never system-wide):
//   ~/.local/share/icons/hicolor/<size>/apps/bleepforge.png  (9 sizes)
//   ~/.local/share/applications/bleepforge.desktop
//
// And refreshes the icon + desktop caches (best-effort).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
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
  console.log(`[install:desktop] using ${appImage.name}`);
  ensureExecutable(appImage.path);
  copyIcons();
  writeDesktopEntry(appImage.path);
  await refreshCaches();
  console.log("");
  console.log("[install:desktop] done. Bleepforge should now appear in your");
  console.log("[install:desktop] KDE / GNOME app menu with the proper icon.");
  console.log("");
  console.log("[install:desktop] If the AppImage's file thumbnail in Dolphin still");
  console.log("[install:desktop] shows a generic icon, that's a separate issue —");
  console.log("[install:desktop] thumbnailing AppImage files requires libappimage,");
  console.log("[install:desktop] which isn't packaged for Fedora. Use the sidecar");
  console.log("[install:desktop] Bleepforge.png in release/ to eyeball the icon.");
}

main().catch((err) => {
  console.error("[install:desktop] failed:", err.message);
  process.exit(1);
});
