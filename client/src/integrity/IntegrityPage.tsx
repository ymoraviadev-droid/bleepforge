import { Link } from "react-router";
import { refreshCatalog } from "../catalog-bus";
import { useCatalog } from "../useCatalog";
import { button } from "../ui";
import { computeIssues, type Issue } from "./issues";

// computeIssues + Issue type live in ./issues.ts so App can run the same
// check to render the nav-link state indicator (✓ when clean, red tint when not).

export function IntegrityPage() {
  const catalog = useCatalog();
  if (catalog === null)
    return <div className="text-neutral-500">Loading catalog…</div>;

  const issues = computeIssues(catalog);
  const byDomain = groupBy(issues, (i) => i.domain);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Integrity</h1>
          <p className="text-xs text-neutral-500">
            {issues.length === 0
              ? "All clear — no broken references found."
              : `${issues.length} issue${issues.length === 1 ? "" : "s"} found.`}
          </p>
        </div>
        <button
          onClick={refreshCatalog}
          className={`${button} bg-neutral-800 text-neutral-100 hover:bg-neutral-700`}
        >
          Refresh
        </button>
      </div>

      {issues.length === 0 ? (
        <div className="rounded border-2 border-emerald-800/60 bg-emerald-950/20 p-8 text-center text-emerald-300">
          ✓ No broken references, no duplicate sequence ids, no dangling FKs.
        </div>
      ) : (
        Object.entries(byDomain).map(([domain, list]) => (
          <section key={domain}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-300">
              {domain} ({list.length})
            </h2>
            <ul className="divide-y divide-neutral-800 border-2 border-neutral-800">
              {list.map((iss, idx) => (
                <li key={idx} className="px-3 py-2 text-sm hover:bg-neutral-900">
                  {iss.link ? (
                    <Link to={iss.link} className="block">
                      <span
                        className={
                          iss.severity === "error"
                            ? "mr-2 text-red-400"
                            : "mr-2 text-amber-400"
                        }
                      >
                        ●
                      </span>
                      <span className="text-neutral-200">{iss.description}</span>
                    </Link>
                  ) : (
                    <span className="text-neutral-200">{iss.description}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function groupBy<T, K extends string>(arr: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of arr) {
    const k = key(x);
    if (!out[k]) out[k] = [];
    out[k].push(x);
  }
  return out;
}
