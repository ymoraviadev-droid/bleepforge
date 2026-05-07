import { NavLink, Navigate, Route, Routes } from "react-router";
import { CatalogDatalists } from "./CatalogDatalists";
import { ImportPage } from "./import/ImportPage";
import { ModalHost } from "./Modal";
import { ThemeSwitcher } from "./Theme";
import { DialogList } from "./dialog/List";
import { DialogEdit } from "./dialog/Edit";
import { DialogGraph } from "./dialog/Graph";
import { IntegrityPage } from "./integrity/IntegrityPage";
import { QuestList } from "./quest/List";
import { QuestEdit } from "./quest/Edit";
import { ItemList } from "./item/List";
import { ItemEdit } from "./item/Edit";
import { KarmaList } from "./karma/List";
import { KarmaEdit } from "./karma/Edit";
import { NpcList } from "./npc/List";
import { NpcEdit } from "./npc/Edit";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `border-2 px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? "border-emerald-600 bg-emerald-950/40 text-emerald-200"
      : "border-transparent text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
  }`;

export function App() {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center gap-6 border-b-2 border-neutral-800 bg-neutral-950 px-6 py-4">
        <span className="font-display text-sm tracking-wider text-emerald-400">
          BLEEPFORGE
        </span>
        <nav className="flex gap-2">
          <NavLink to="/dialogs" className={navLinkClass}>
            Dialogs
          </NavLink>
          <NavLink to="/quests" className={navLinkClass}>
            Quests
          </NavLink>
          <NavLink to="/npcs" className={navLinkClass}>
            NPCs
          </NavLink>
          <NavLink to="/items" className={navLinkClass}>
            Items
          </NavLink>
          <NavLink to="/karma" className={navLinkClass}>
            Karma
          </NavLink>
          <NavLink to="/integrity" className={navLinkClass}>
            Integrity
          </NavLink>
          <NavLink to="/import" className={navLinkClass}>
            Import
          </NavLink>
        </nav>
        <div className="flex-1" />
        <ThemeSwitcher />
      </header>
      <CatalogDatalists />
      <ModalHost />
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/dialogs" replace />} />
          <Route path="/dialogs" element={<DialogGraph />} />
          <Route path="/dialogs/list" element={<DialogList />} />
          <Route path="/dialogs/new" element={<DialogEdit />} />
          <Route path="/dialogs/:folder/:id" element={<DialogEdit />} />
          <Route path="/quests" element={<QuestList />} />
          <Route path="/quests/new" element={<QuestEdit />} />
          <Route path="/quests/:id" element={<QuestEdit />} />
          <Route path="/items" element={<ItemList />} />
          <Route path="/items/new" element={<ItemEdit />} />
          <Route path="/items/:slug" element={<ItemEdit />} />
          <Route path="/karma" element={<KarmaList />} />
          <Route path="/karma/new" element={<KarmaEdit />} />
          <Route path="/karma/:id" element={<KarmaEdit />} />
          <Route path="/npcs" element={<NpcList />} />
          <Route path="/npcs/new" element={<NpcEdit />} />
          <Route path="/npcs/:npcId" element={<NpcEdit />} />
          <Route path="/integrity" element={<IntegrityPage />} />
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </main>
    </div>
  );
}
