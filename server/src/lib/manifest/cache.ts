// Runtime cache for the user project's bleepforge_manifest.json.
//
// Built once at boot from the same loader the /api/manifest endpoint uses
// (./loader.ts). Refreshed on watcher events for the manifest file. The
// generic mapper, the manifest-aware projectIndex extension (commit #9+),
// and the generic UI's data-fetch paths all read from this singleton
// instead of calling loadManifest() per-request — the loader's stat + read
// + zod parse is cheap but not free, and request-path callers benefit
// from a constant-time getter.
//
// Lifecycle mirrors projectIndex / scriptIndex: build at boot, reset on
// project hot-reload (switch active project), refresh on file change.
// `manifestCache.get()` returns null when the manifest is missing,
// invalid, or not applicable (notebook mode) — same four states the
// loader surfaces. Callers gate their behavior on a non-null return.
//
// No lazy build, no auto-rebuild on get() — the cache is a passive holder
// for whatever the last build() / refresh() call produced. Keeps the
// reactive surface small (one input: file watcher; one output: getters).

import type { Entry, Manifest, SubResource } from "@bleepforge/shared";
import { loadManifest, type ManifestLoadResult } from "./loader.js";

class ManifestCache {
  private manifest: Manifest | null = null;
  private lastLoadStatus: ManifestLoadResult["status"] | null = null;
  private lastError: string | null = null;
  private domainByName = new Map<string, Entry>();
  private subResourceByName = new Map<string, SubResource>();

  /**
   * Re-read + re-parse the manifest from disk and replace the cache.
   * Always non-throwing — loader returns a discriminated result; we
   * stash whichever state it produces. Caller can call again whenever
   * the watcher fires; concurrent calls are safe (last write wins).
   */
  async build(): Promise<void> {
    const result = await loadManifest();
    this.lastLoadStatus = result.status;
    this.lastError = result.error ?? null;

    if (result.status === "ok" && result.manifest) {
      this.manifest = result.manifest;
      this.rebuildIndices();
    } else {
      this.manifest = null;
      this.domainByName.clear();
      this.subResourceByName.clear();
    }
  }

  /** Convenience alias for build() — clearer at call sites where the
   *  semantic is "refresh due to file change" rather than "initial boot". */
  refresh(): Promise<void> {
    return this.build();
  }

  /** The parsed manifest, or null when status is not-applicable /
   *  missing / error. */
  get(): Manifest | null {
    return this.manifest;
  }

  /** Look up a single domain entry by name. Domains the manifest doesn't
   *  declare return null — callers fall back to whatever made sense
   *  pre-manifest (typically: nothing happens). */
  getDomain(name: string): Entry | null {
    return this.domainByName.get(name) ?? null;
  }

  /** Look up a sub-resource declaration by name. Returns null when the
   *  name doesn't appear in `subResources[]`. */
  getSubResource(name: string): SubResource | null {
    return this.subResourceByName.get(name) ?? null;
  }

  /** All declared domains, in manifest order. Useful for the boot
   *  pipeline (build projectIndex for each) and for diagnostics. */
  listDomains(): Entry[] {
    return this.manifest?.domains ?? [];
  }

  /** All declared sub-resources, in manifest order. */
  listSubResources(): SubResource[] {
    return this.manifest?.subResources ?? [];
  }

  /** Status of the last build() — for diagnostic surfaces. */
  status(): {
    state: ManifestLoadResult["status"] | null;
    domains: number;
    subResources: number;
    error: string | null;
  } {
    return {
      state: this.lastLoadStatus,
      domains: this.manifest?.domains.length ?? 0,
      subResources: this.manifest?.subResources.length ?? 0,
      error: this.lastError,
    };
  }

  /** Wipe the cache. Called when switching active project (hot-reload)
   *  or transitioning to notebook / limp mode. Mirrors projectIndex.reset
   *  + scriptIndex.reset for symmetry. */
  reset(): void {
    this.manifest = null;
    this.lastLoadStatus = null;
    this.lastError = null;
    this.domainByName.clear();
    this.subResourceByName.clear();
  }

  private rebuildIndices(): void {
    this.domainByName.clear();
    this.subResourceByName.clear();
    if (!this.manifest) return;
    for (const d of this.manifest.domains) this.domainByName.set(d.domain, d);
    for (const s of this.manifest.subResources) {
      this.subResourceByName.set(s.subResource, s);
    }
  }
}

export const manifestCache: ManifestCache = new ManifestCache();
