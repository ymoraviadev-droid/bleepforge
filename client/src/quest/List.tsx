import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ButtonLink } from "../Button";
import type { Quest } from "@bleepforge/shared";
import { questsApi } from "../api";

export function QuestList() {
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    questsApi.list().then(setQuests).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (quests === null) return <div className="text-neutral-500">Loading…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quests</h1>
        <ButtonLink to="/quests/new">New</ButtonLink>
      </div>
      {quests.length === 0 ? (
        <p className="text-neutral-500">No quests yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded border border-neutral-800">
          {quests.map((q) => (
            <li key={q.Id} className="hover:bg-neutral-900">
              <Link
                to={`/quests/${encodeURIComponent(q.Id)}`}
                className="block px-4 py-3"
              >
                <div className="font-mono text-sm text-neutral-100">{q.Id}</div>
                <div className="text-xs text-neutral-500">
                  {q.Title || "(untitled)"} · {q.Objectives.length} obj ·{" "}
                  {q.Rewards.length} reward
                  {q.QuestGiverId ? ` · giver: ${q.QuestGiverId}` : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
