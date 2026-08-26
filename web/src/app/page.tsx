import Link from "next/link";

const workflow = [
  {
    title: "Connect wallet",
    description: "Bring your Freighter, xBull, or LOBSTR wallet. AnchorScout never takes custody.",
  },
  {
    title: "Enter transfer details",
    description: "Choose the asset, destination currency, amount, and payout rail you want to compare.",
  },
  {
    title: "Compare providers",
    description: "See live, attributed market and capability data with missing fields kept visible.",
  },
  {
    title: "Select a route",
    description: "Review the evidence, disclosures, and settlement mode before committing to a route.",
  },
  {
    title: "Sign and track",
    description: "Authorize each step yourself, then follow the proof and public receipt.",
  },
];

const features = [
  {
    label: "01 / LIVE SOURCES",
    title: "Data with a paper trail",
    description: "Coins.ph market depth, MoneyGram capabilities, and configured SEP-38 anchors arrive through one normalized comparison surface.",
  },
  {
    label: "02 / HONEST QUOTES",
    title: "Missing is a valid answer",
    description: "Fees, timing, limits, expiry, and payout support stay attributed and nullable. Incomplete data never becomes a made-up promise.",
  },
  {
    label: "03 / STELLAR PROOF",
    title: "A result you can verify",
    description: "Route selection and settlement receipts are wallet-authorized and recorded through Soroban contracts on Stellar Testnet.",
  },
];

function RoutePreview() {
  return (
    <figure className="landing-route-preview">
      <figcaption className="sr-only">
        An illustrative AnchorScout route comparison showing a Stellar transfer, provider evidence, and a wallet-owned settlement proof.
      </figcaption>
      <div className="landing-preview-head">
        <span className="landing-preview-label">PRODUCT PREVIEW</span>
        <span className="landing-preview-network"><i aria-hidden="true" /> Stellar Testnet</span>
      </div>
      <div className="landing-preview-path" aria-hidden="true">
        <div><span>YOU SEND</span><strong>100 XLM</strong></div>
        <b>→</b>
        <div><span>DESTINATION</span><strong>PHP</strong></div>
        <b>→</b>
        <div><span>PAYOUT</span><strong>BANK</strong></div>
      </div>
      <div className="landing-preview-list">
        <div className="landing-preview-route landing-preview-route-best">
          <div className="landing-preview-provider"><span>01 / MARKET REFERENCE</span><strong>Coins.ph</strong><small>Public order-book depth</small></div>
          <div className="landing-preview-data"><strong>LIVE</strong><small>rate + depth</small></div>
          <span className="landing-preview-badge">ATTRIBUTED</span>
        </div>
        <div className="landing-preview-route">
          <div className="landing-preview-provider"><span>02 / TESTNET CAPABILITY</span><strong>MoneyGram</strong><small>SEP-24 USDC rail</small></div>
          <div className="landing-preview-data"><strong>READY</strong><small>capability check</small></div>
          <span className="landing-preview-badge landing-preview-badge-muted">SIMULATED FIAT STEP</span>
        </div>
      </div>
      <div className="landing-preview-foot"><span><i aria-hidden="true" /> No keys leave your wallet</span><span>Illustrative interface preview</span></div>
    </figure>
  );
}

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="brand" href="/" aria-label="AnchorScout home">
          <span className="brand-mark">A</span>
          <span>AnchorScout</span>
        </Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#why-stellar">Why Stellar</a>
        </nav>
        <Link className="button primary small landing-nav-cta" href="/app">
          Open app <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="landing-hero-copy">
          <p className="landing-kicker"><span aria-hidden="true" /> Stellar route intelligence</p>
          <h1 id="landing-hero-title">See the route before you <em>send.</em></h1>
          <p className="landing-hero-lede">AnchorScout makes Stellar payment routes legible before your wallet signs. Compare real external data, understand what is missing, and keep the final decision in your hands.</p>
          <div className="landing-hero-actions">
            <Link className="button primary landing-hero-cta" href="/app">Compare Routes <span aria-hidden="true">→</span></Link>
            <a className="landing-text-link" href="#how-it-works">See the workflow <span aria-hidden="true">↓</span></a>
          </div>
          <div className="landing-proof-row" aria-label="AnchorScout principles">
            <span>Non-custodial</span>
            <span>Provider data attributed</span>
            <span>On-chain proof</span>
          </div>
        </div>
        <RoutePreview />
      </section>

      <section className="landing-section landing-how" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-section-heading">
          <div>
            <p className="landing-kicker">The workflow</p>
            <h2 id="how-title">From wallet to verified result.</h2>
          </div>
          <p>One focused path from intent to evidence. You authorize every financial action; AnchorScout keeps the comparison and status legible.</p>
        </div>
        <ol className="landing-workflow">
          {workflow.map((step, index) => (
            <li key={step.title}>
              <span className="landing-step-number" aria-hidden="true">0{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section landing-why" id="why-stellar" aria-labelledby="why-title">
        <div className="landing-why-copy">
          <p className="landing-kicker">Why Stellar</p>
          <h2 id="why-title">A fast, low-cost proof layer for money in motion.</h2>
          <p>Stellar gives AnchorScout a settlement rail that is open, efficient, and easy to verify. Soroban records the route decision and receipt while your wallet stays the only place a signature can originate.</p>
          <div className="landing-why-points">
            <span><b aria-hidden="true">✓</b> User-owned signatures</span>
            <span><b aria-hidden="true">✓</b> Public evidence</span>
            <span><b aria-hidden="true">✓</b> Contract-backed history</span>
          </div>
        </div>
        <div className="landing-receipt" aria-label="Illustrative Stellar settlement receipt">
          <div className="landing-receipt-top"><span>SETTLEMENT RECEIPT</span><span className="landing-receipt-status"><i aria-hidden="true" /> CONFIRMED</span></div>
          <strong>Route proof recorded</strong>
          <div className="landing-receipt-lines">
            <span><small>NETWORK</small><b>Stellar Testnet</b></span>
            <span><small>AUTHORITY</small><b>Your wallet</b></span>
            <span><small>RECEIPT</small><b className="landing-mono">eefe…d93a</b></span>
          </div>
          <div className="landing-receipt-bar"><i aria-hidden="true" /><span>Route Registry → Settlement Receipt</span></div>
        </div>
      </section>

      <section className="landing-section landing-features" aria-labelledby="features-title">
        <div className="landing-section-heading landing-section-heading-tight">
          <div>
            <p className="landing-kicker">Built for clear decisions</p>
            <h2 id="features-title">The useful parts, upfront.</h2>
          </div>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => (
            <article className="landing-feature" key={feature.label}>
              <p className="landing-feature-label">{feature.label}</p>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="cta-title">
        <div>
          <p className="landing-kicker">Ready when you are</p>
          <h2 id="cta-title">Compare the route. Keep the control.</h2>
        </div>
        <Link className="button secondary landing-cta-button" href="/app">Compare Routes <span aria-hidden="true">→</span></Link>
      </section>

      <footer className="landing-footer">
        <Link className="brand" href="/" aria-label="AnchorScout home"><span className="brand-mark">A</span><span>AnchorScout</span></Link>
        <span>Built on Stellar for transparent route decisions.</span>
        <span>External fiat payout steps remain clearly marked when simulated.</span>
      </footer>
    </main>
  );
}
