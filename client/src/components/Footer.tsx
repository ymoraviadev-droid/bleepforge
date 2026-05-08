// App-level footer with authorship credit. Sits in normal flow at the bottom
// of <main> in App.tsx — short pages let flex push it to the viewport bottom,
// long pages let it scroll into view at the end. Never occludes content.
//
// CreditLine is exported separately so the splash screen can render the same
// authorship line without inheriting the footer chrome (border, padding).

import type { ReactElement } from "react";

interface CreditLineProps {
  className?: string;
}

export function CreditLine({ className = "" }: CreditLineProps): ReactElement {
  return (
    <div className={`text-center text-[10px] text-neutral-600 ${className}`}>
      <span>Authored by Yehonatan Moravia &amp; Archie</span>
      <span
        aria-hidden
        className="mx-2 inline-block size-1.5 bg-neutral-500 align-middle"
      />
      <a
        href="mailto:ymoravia.dev@gmail.com"
        className="transition-colors hover:text-neutral-400"
      >
        ymoravia.dev@gmail.com
      </a>
    </div>
  );
}

export function Footer(): ReactElement {
  return (
    <footer className="mt-auto border-t-2 border-neutral-800/50 px-6 py-4">
      <CreditLine />
    </footer>
  );
}
