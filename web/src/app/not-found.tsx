import Link from "next/link";

export default function NotFound() {
  return (
    <main className="hero">
      <div className="eyebrow">404 — route not found</div>
      <h1>This path has no <em>quote.</em></h1>
      <p>Return to the comparison workspace and find a live Stellar route.</p>
      <Link className="button primary" href="/">Back to AnchorScout</Link>
    </main>
  );
}
