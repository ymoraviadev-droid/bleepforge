import { useCatalog } from "../lib/useCatalog";

export const DL = {
  npcIds: "dlc-npc-ids",
  npcNames: "dlc-npc-names",
  itemSlugs: "dlc-item-slugs",
  questIds: "dlc-quest-ids",
  sequenceIds: "dlc-sequence-ids",
  flags: "dlc-flags",
  factions: "dlc-factions",
  balloonIds: "dlc-balloon-ids",
} as const;

export function CatalogDatalists() {
  const catalog = useCatalog();
  if (!catalog) return null;

  return (
    <>
      <datalist id={DL.npcIds}>
        {catalog.npcs.map((n) => (
          <option key={n.NpcId} value={n.NpcId}>
            {n.DisplayName}
          </option>
        ))}
      </datalist>
      <datalist id={DL.npcNames}>
        {catalog.npcs.map((n) => (
          <option key={n.NpcId} value={n.DisplayName} />
        ))}
      </datalist>
      <datalist id={DL.itemSlugs}>
        {catalog.items.map((i) => (
          <option key={i.Slug} value={i.Slug}>
            {i.DisplayName}
          </option>
        ))}
      </datalist>
      <datalist id={DL.questIds}>
        {catalog.quests.map((q) => (
          <option key={q.Id} value={q.Id}>
            {q.Title}
          </option>
        ))}
      </datalist>
      <datalist id={DL.sequenceIds}>
        {catalog.sequences.map((s) => (
          <option key={s.Id} value={s.Id} />
        ))}
      </datalist>
      <datalist id={DL.flags}>
        {catalog.flags.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <datalist id={DL.factions}>
        {catalog.factions.map((f) => (
          <option key={f.Faction} value={f.Faction}>
            {f.DisplayName}
          </option>
        ))}
      </datalist>
      <datalist id={DL.balloonIds}>
        {catalog.balloonRefs.map((b) => (
          <option key={b.id} value={b.id}>
            {b.balloon.Text.length > 40
              ? `${b.balloon.Text.slice(0, 40)}…`
              : b.balloon.Text || "(empty)"}
          </option>
        ))}
      </datalist>
    </>
  );
}
