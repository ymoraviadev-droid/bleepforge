# test-project — Phase 5 validation harness

Synthetic Godot 4 / C# project that exercises `godot-lib` + the Bleepforge manifest emitter against **all four entry kinds** (`domain`, `foldered`, `enumKeyed`, `discriminatedFamily`). Use it to verify the full v0.2.6 round-trip end-to-end:

1. Library reflects over user types → emits a manifest.
2. Bleepforge reads the manifest from the active project's Godot root.
3. Bleepforge's Diagnostics → Manifest tab surfaces the parse result.

**This is NOT a game.** It's a contrived sample project whose only purpose is to prove the contract works. The data is intentionally minimal — small handful of files, no game logic, simple field shapes — so failures are easy to localize.

## Setup (one-time)

```bash
cd godot-lib/test-project
./setup.sh                                  # symlinks ../addons/bleepforge → addons/bleepforge
```

**Windows fallback:** symlinks need elevated permissions on Windows; just copy `../addons/bleepforge/` into `./addons/bleepforge/` manually instead.

## Round-trip walkthrough

### 1. Open in Godot

Open this folder (`godot-lib/test-project/`) in Godot 4.4+. Godot will:

1. Import the C# scripts (the project's csproj inherits `Godot.NET.Sdk/4.4.0`, targets `net8.0`).
2. Auto-enable the Bleepforge plugin (declared in `project.godot`'s `[editor_plugins]` block).
3. Fire `BleepforgePlugin._EnterTree`, which calls the manifest emitter.
4. Write `bleepforge_manifest.json` at the project root.

Watch the Output panel for:

```text
[Bleepforge] Manifest emitted: 4 domain(s), 0 sub-resource(s) → res://bleepforge_manifest.json
```

If you see warnings instead, the emitter found something it couldn't classify — most likely a C# build issue or a missing autoload.

### 2. Verify the manifest

Open the generated `bleepforge_manifest.json` at the project root. You should see four entries in `domains[]`:

| domain | kind | class | notes |
| --- | --- | --- | --- |
| `note` | `domain` | `Note` | Flat folder, key=`Slug` |
| `snippet` | `foldered` | `Snippet` | groupBy=`parentDir` (language token) |
| `element` | `enumKeyed` | `ElementData` | 4 enum values: Fire / Water / Earth / Air |
| `equipment` | `discriminatedFamily` | `Equipment` | Variants: `Sword` (Damage), `Shield` (Defense); discriminator=`Type` |

Plus `subResources: []` (this test project doesn't exercise sub-resources — the field type is supported but adding it here was deferred to keep the harness minimal).

### 3. Open in Bleepforge

In Bleepforge (`pnpm dev` or the AppImage), create a new sync-mode project pointing at this folder:

- `+ New project` on the `/projects` page
- Name: "Bleepforge test project" (or whatever)
- Mode: `Sync to Godot`
- Godot folder: pick `godot-lib/test-project/`
- Submit, switch to it

### 4. Check the Manifest tab

Navigate to `/diagnostics/manifest` in Bleepforge. You should see:

- Green **OK** badge
- Schema version: `1`, Domains: `4`, Sub-resources: `0`
- File: `<absolute>/godot-lib/test-project/bleepforge_manifest.json`
- Per-domain table with all 4 entries, their kind, class, key field, field count, view (`list`), overrideUi (`—`)

If the table shows only some domains, or the kinds are wrong, or fields are missing — that's an emitter bug worth filing.

### 5. Test hot reload (optional)

With Godot still open + a registry running:

1. Edit a `.tres` file in `data/notes/welcome.tres` — change the `Title` field's value.
2. Save the file.
3. Godot's filesystem watcher fires → `EditorInterface.Singleton.GetResourceFilesystem().FilesystemChanged` → `NoteRegistry.OnFilesystemChanged` → `Rebuild()` → `RegistryRebuilt` signal emitted.

The signal isn't visible without a listener, but you can confirm it's firing by adding a print:

```csharp
public override void _EnterTree()
{
    Instance = this;
    base._EnterTree();
    RegistryRebuilt += () => GD.Print($"[Test] NoteRegistry rebuilt, {Count} note(s)");
}
```

## Layout

```text
test-project/
├── README.md                      this file
├── setup.sh                       creates the addon symlink
├── .gitignore                     ignores .godot/, addons/bleepforge, manifest, build artifacts
├── project.godot                  Godot config — enables plugin, registers 4 autoloads
├── BleepforgeTestProject.csproj   .NET 8 + Godot 4.4 SDK
├── icon.svg                       project icon (pixel-art note pad)
├── addons/
│   └── bleepforge/                symlink → ../../addons/bleepforge (the canonical addon)
├── data/
│   ├── notes/                     domain kind — 3 .tres files at the folder root
│   ├── snippets/                  foldered kind — 2 language folders, 2 files each
│   │   ├── cs/
│   │   └── gdscript/
│   ├── elements/                  enumKeyed kind — one subfolder per enum value
│   │   ├── Fire/Fire.tres
│   │   ├── Water/Water.tres
│   │   ├── Earth/Earth.tres
│   │   └── Air/Air.tres
│   └── equipment/                 discriminatedFamily kind — variant subclasses
│       ├── iron-sword.tres        (Sword variant, Type=0)
│       └── oak-shield.tres        (Shield variant, Type=1)
└── src/
    ├── Resources/
    │   ├── Note.cs                BleepforgeResource subclass for the domain kind
    │   ├── Snippet.cs             BleepforgeResource subclass for the foldered kind
    │   ├── ElementData.cs         BleepforgeResource subclass for the enumKeyed kind
    │   ├── ElementKind.cs         the enum (Fire/Water/Earth/Air)
    │   ├── Equipment.cs           base class for the discriminatedFamily kind
    │   ├── EquipmentType.cs       discriminator enum (Sword/Shield)
    │   ├── Sword.cs               variant adding Damage
    │   └── Shield.cs              variant adding Defense
    └── Registries/
        ├── NoteRegistry.cs        BleepforgeRegistry<Note>
        ├── SnippetRegistry.cs     BleepforgeFolderedRegistry<Snippet>
        ├── ElementRegistry.cs     BleepforgeEnumRegistry<ElementKind, ElementData>
        └── EquipmentRegistry.cs   BleepforgeDiscriminatedRegistry<Equipment>
```

## What this validates

- **All 4 entry kinds emit correctly.** The manifest's `domains[]` covers `domain` / `foldered` / `enumKeyed` / `discriminatedFamily`.
- **Per-kind config extraction works.** Foldered's `groupBy: "parentDir"` comes from `SnippetRegistry.GetGroupMode()` via `Activator.CreateInstance + method invoke`. EnumKeyed's `enumValues` come from `Enum.GetNames(typeof(ElementKind))`. DiscriminatedFamily's `variants[]` come from walking subclasses of `Equipment`.
- **Common scalar field types map correctly.** Strings (`Note.Title`), multiline strings (`Note.Body`, via `[Export(PropertyHint.MultilineText)]`), enums (`ElementData.ElementKind`), ints (`ElementData.Strength`), floats (`Equipment.Weight`).
- **Discriminator detection works.** Emitter finds the first enum-typed field on `Equipment` (= `Type`) and uses it as the discriminator. Variant `value` strings come from instantiating each variant + reading their default `Type` value.
- **Domain-name heuristic works.** `NoteRegistry` → strip "Registry" → lowercase → `note`. Same for `SnippetRegistry`, `ElementRegistry`, `EquipmentRegistry`.
- **Bleepforge editor consumes the manifest correctly.** Diagnostics → Manifest tab parses + displays without errors.

## What this does NOT validate (deferred)

- **Sub-resource emission.** No `[Export] LootTable Loot` style fields in this harness. Could be added in a future increment if sub-resource bugs surface.
- **`[BleepforgeFlag]` / `[BleepforgeShowWhen]` / other attributes.** None of the test resources use them. Adding a quest-style discriminated objective field would exercise `[BleepforgeShowWhen]`.
- **Array fields.** No array of refs or sub-resources. Add an NPC-style `Quests[]` field to validate.
- **`[BleepforgeView]` / `[BleepforgeOverrideUi]`.** Not tested here; defaults are exercised.
- **Generic editor surfaces** (v0.2.7). The harness only tests that the manifest is correct + readable; the generic `<DomainList>` + `<DomainEdit>` come later.

## Cleaning up

If something goes sideways and you want to start fresh:

```bash
cd godot-lib/test-project
rm -rf .godot/ .mono/ bin/ obj/ addons/bleepforge bleepforge_manifest.json
./setup.sh
```

Then reopen in Godot.

## See also

- [../README.md](../README.md) — godot-lib status + the rest of the Phase tracker.
- [../../shared/src/manifest.ts](../../shared/src/manifest.ts) — the canonical zod schema this manifest must match.
- [../../CLAUDE.md](../../CLAUDE.md) — project bible. Search for "Genericization arc" for the full v0.2.6 → v0.3.0 plan.
