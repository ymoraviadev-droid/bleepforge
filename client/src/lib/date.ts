// Date formatting helpers. Native Intl.DateTimeFormat (via Date's
// toLocale* methods) handles both timezone-conversion to the user's
// local zone AND locale-aware presentation; no luxon / date-fns needed
// for the small surface we ship.
//
// Convention: ALL dates rendered to the user use month-in-words to
// dodge the global ambiguity between US (M/D/Y) and EU (D/M/Y) numeric
// formats. `5/13/2026` reads as May to Americans and "month 13" (no
// such month) to most of Europe — fine in Europe by clipping to the
// last valid month-int, terrible in practice. `May 13, 2026` is
// unambiguous everywhere.
//
// Times (HH:MM:SS) are locale-stable enough to leave alone — no
// 12/24-hour ambiguity that matters for a debugging log.

/**
 * Long date — month in words, no time.
 * Example: "May 13, 2026" (en-US), "13 May 2026" (en-GB), "13. Mai 2026" (de).
 */
export function formatLongDate(iso: string | number | Date): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Long date + time — month in words, includes hour + minute. Local TZ.
 * Example: "May 13, 2026 at 5:42 PM" (en-US).
 */
export function formatLongDateTime(iso: string | number | Date): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
