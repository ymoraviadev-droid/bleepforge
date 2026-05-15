import { shadersApi, type ShaderAsset } from "../api";
import { createStore, useStore, type Store } from "./createStore";

// Shaders are a flat list of file descriptors (path / basename / parentRel
// / shaderType / pattern / color). The `.gdshader` text source is fetched
// separately per file on the edit page — not cached here.
//
// The shader API can fail when the Godot project has no shaders or the
// route isn't reachable; the catalog used to wrap the call in a
// catch-fallback to keep the rest of the boot alive. The store does the
// same — a failed fetch lands in `status: "error"` but doesn't take
// other slices down with it.
export const shaderStore: Store<ShaderAsset> = createStore<ShaderAsset>({
  name: "shaders",
  fetcher: async () => (await shadersApi.list()).shaders,
  keyOf: (s) => s.path,
});

export const useShaders = (): ReturnType<typeof useStore<ShaderAsset>> =>
  useStore(shaderStore);
