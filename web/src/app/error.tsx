"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error("anchorscout_render_error", error), [error]);
  return (
    <main className="hero">
      <div className="eyebrow">Recoverable application error</div>
      <h1>That route hit a <em>detour.</em></h1>
      <p>No wallet transaction was submitted by this page error. Try rendering the application again.</p>
      <button className="button primary" onClick={retry}>Try again</button>
    </main>
  );
}

