import { useCallback, useEffect, useState } from "react";
import { Outlet, useOutletContext } from "react-router";
import { type HelpCategoryGroup } from "@bleepforge/shared";
import { helpApi } from "../../lib/api";
import { HelpSidebar } from "./HelpSidebar";

// Parent layout for every /help/* route. Owns the sidebar + the full-library
// allGroups state so navigation between routes stays smooth — previously
// each view ran its own listAll() fetch and rendered its own <HelpSidebar>,
// which caused a visible "refresh" blink between clicks: the new view
// remounted with allGroups=null, the sidebar disappeared for a frame until
// the fetch returned, and only then the layout reconciled. With a persistent
// layout the sidebar stays mounted across navigations and only the
// <Outlet /> content swaps.

export interface HelpLayoutContext {
  /** Full help library. `null` while the first fetch is in flight. */
  allGroups: HelpCategoryGroup[] | null;
}

export function HelpLayout() {
  const [allGroups, setAllGroups] = useState<HelpCategoryGroup[] | null>(null);

  const refetch = useCallback(() => {
    helpApi
      .listAll()
      .then(setAllGroups)
      .catch(() => setAllGroups([]));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
      <HelpSidebar groups={allGroups ?? []} />
      <div className="min-w-0">
        <Outlet context={{ allGroups } satisfies HelpLayoutContext} />
      </div>
    </div>
  );
}

/** Hook for /help/* children to consume the layout's allGroups state. */
export function useHelpLayout(): HelpLayoutContext {
  return useOutletContext<HelpLayoutContext>();
}
