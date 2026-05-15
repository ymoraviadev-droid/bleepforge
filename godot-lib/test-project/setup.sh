#!/bin/bash
# Set up the bleepforge addon for this test project.
#
# The addon's canonical location is godot-lib/addons/bleepforge/. We
# symlink it into godot-lib/test-project/addons/bleepforge/ so the test
# project picks it up under res://addons/bleepforge/ — Godot's standard
# plugin discovery path. Symlink instead of copy so the addon evolves
# in lockstep without git history drift between two locations.
#
# Run this once after cloning (or whenever the symlink gets clobbered).
# Windows users: skip the script and copy ../addons/bleepforge/ to
# ./addons/bleepforge/ manually (Windows symlinks need elevated
# permissions; not worth the friction for a test project).

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ADDON_DIR="$HERE/addons/bleepforge"

# Symlink target is RELATIVE TO THE SYMLINK LOCATION (test-project/addons/),
# not to test-project/. So we go up two levels to reach godot-lib/, then
# back into addons/bleepforge.
SYMLINK_TARGET="../../addons/bleepforge"

# Sanity check: confirm the canonical addon exists at the expected
# location relative to test-project/ (one level up to godot-lib/).
SOURCE_FROM_HERE="$HERE/../addons/bleepforge"
if [ ! -d "$SOURCE_FROM_HERE" ]; then
  echo "ERROR: canonical addon not found at $SOURCE_FROM_HERE" >&2
  echo "Expected godot-lib/addons/bleepforge/ to exist (Phase 1+ output)." >&2
  exit 1
fi

mkdir -p "$HERE/addons"

if [ -L "$ADDON_DIR" ] || [ -e "$ADDON_DIR" ]; then
  rm -rf "$ADDON_DIR"
fi

ln -s "$SYMLINK_TARGET" "$ADDON_DIR"

echo "Linked $ADDON_DIR"
echo "    → $SYMLINK_TARGET (resolves to $(cd "$SOURCE_FROM_HERE" && pwd))"
echo
echo "Open this folder in Godot 4.4+ to verify Phase 5 round-trip."
