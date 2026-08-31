import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation | AnchorScout",
  description:
    "AnchorScout product, usage, setup, provider, architecture, and Stellar Testnet documentation.",
};

const contracts = [
  {
    name: "Route Registry",
    purpose: "Stores the selected route and its final state.",
    id: "CBYCCXCJLFQKUIPNJDQNXXIGV26S4FSXGHRYQQBPU3EYUGE6EXRRDZ5H",
  },
  {
    name: "Settlement Receipt",
    purpose: "Stores the wallet-authorized outcome and finalizes the route.",
    id: "CBQKALTRUEBNTDOKL7UOOSEFPJMHZRQCWV5C6VZA4T3TO4WEB2OIBDJM",
  },
  {
    name: "Route Executor",
    purpose: "Runs route creation, the 0.1 XLM proof, and receipt recording atomically.",
    id: "CAFKJQJGL4U3LAGEGXARMHGURTQUUCJYSRBKMZC7AI3JXMQHUZW2BIQH",
  },
];

const toc = [
  ["overview", "Overview"],
  ["features", "Features"],
  ["usage", "How to use"],
  ["setup", "Local setup"],
  ["implementation", "Implementation"],
  ["providers", "Provider data"],
  ["contracts", "Contracts"],
  ["verification", "Verification"],
] as const;

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

export default function DocumentationPage() {
  return (
    <main className="docs-page">
      <header className="docs-header">
        <Link className="brand" href="/" aria-label="AnchorScout home">
          <span className="brand-mark">
            <Image className="brand-logo" src="/logo.png" alt="" width={42} height={42} priority />
          </span>
          <span>AnchorScout</span>
        </Link>
        <span className="docs-header-label">Documentation</span>
        <nav aria-label="Documentation actions">
          <ExternalLink href="https://github.com/zaejohn/AnchorScout">GitHub</ExternalLink>
          <Link className="button primary small" href="/app">
            Open app <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </header>

      <div className="docs-shell">
        <aside className="docs-toc" aria-label="On this page">
          <p>On this page</p>
          <nav>
            {toc.map(([href, label], index) => (
              <a href={`#${href}`} key={href}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                {label}
              </a>
            ))}
          </nav>
          <div className="docs-toc-note">
            <span aria-hidden="true" />
            <div>
              <strong>Network</strong>
              <small>Stellar Testnet</small>
            </div>
          </div>
        </aside>

        <article className="docs-content">
          <section className="docs-hero" id="overview">
            <p className="docs-eyebrow">Product documentation</p>
            <h1>Understand every route before your wallet signs.</h1>
            <p className="docs-lede">
              AnchorScout compares attributed payment-route data, lets the user choose a route,
              and records one wallet-authorized proof on Stellar Testnet.
            </p>
            <div className="docs-hero-actions">
              <Link className="button primary" href="/app">
                Compare routes <span aria-hidden="true">→</span>
              </Link>
              <ExternalLink href="https://github.com/zaejohn/AnchorScout">View source</ExternalLink>
            </div>
            <div className="docs-scope">
              <strong>Testnet scope</strong>
              <p>
                AnchorScout proves the route decision and a 0.1 XLM Testnet payment. It does not
                execute the quoted PHP payout. Any unavailable external fiat step is clearly marked
                as simulated.
              </p>
            </div>
          </section>

          <section className="docs-section" id="features">
            <div className="docs-section-heading">
              <span>01</span>
              <div>
                <p>Features</p>
                <h2>What AnchorScout does</h2>
              </div>
            </div>
            <div className="docs-feature-grid">
              <article>
                <strong>Multi-wallet access</strong>
                <p>Connect Freighter, xBull, or LOBSTR through Stellar Wallets Kit.</p>
              </article>
              <article>
                <strong>Live route comparison</strong>
                <p>Compare rate, fee, timing, payout type, availability, and source evidence.</p>
              </article>
              <article>
                <strong>Dynamic eligibility</strong>
                <p>Providers appear only when they support the requested asset, rail, and corridor.</p>
              </article>
              <article>
                <strong>One-sign proof</strong>
                <p>Approve one atomic contract transaction instead of several separate signatures.</p>
              </article>
              <article>
                <strong>Verified history</strong>
                <p>Open the single confirmed transaction on Stellar Expert from route history.</p>
              </article>
              <article>
                <strong>XLM utility</strong>
                <p>Send a standard Testnet XLM payment from the app navigation.</p>
              </article>
            </div>
          </section>

          <section className="docs-section" id="usage">
            <div className="docs-section-heading">
              <span>02</span>
              <div>
                <p>Usage</p>
                <h2>Complete the route flow</h2>
              </div>
            </div>
            <ol className="docs-steps">
              <li><span>1</span><div><strong>Connect a Testnet wallet</strong><p>Choose a supported wallet, confirm Stellar Testnet, and check the XLM balance.</p></div></li>
              <li><span>2</span><div><strong>Enter transfer details</strong><p>Choose XLM or USDC, enter the amount, destination currency, and payout method.</p></div></li>
              <li><span>3</span><div><strong>Compare available routes</strong><p>Review live provider evidence, missing fields, disclosures, and route eligibility.</p></div></li>
              <li><span>4</span><div><strong>Choose one route</strong><p>Select a valid result. Expired or unavailable routes cannot continue.</p></div></li>
              <li><span>5</span><div><strong>Approve once</strong><p>Your wallet signs one atomic route-proof transaction. AnchorScout submits and confirms it.</p></div></li>
              <li><span>6</span><div><strong>Verify the result</strong><p>Read the success or failure state, then open the one transaction link in Stellar Expert.</p></div></li>
            </ol>
          </section>

          <section className="docs-section" id="setup">
            <div className="docs-section-heading">
              <span>03</span>
              <div>
                <p>Setup</p>
                <h2>Run locally</h2>
              </div>
            </div>
            <div className="docs-code" aria-label="Local setup commands">
              <span>Terminal</span>
              <pre><code>{`git clone https://github.com/zaejohn/AnchorScout.git
cd AnchorScout/web
cp .env.example .env.local
pnpm install
pnpm dev`}</code></pre>
            </div>
            <p className="docs-note">
              Open <code>http://localhost:3000/app</code>. Set your wallet to Testnet and fund it with
              Friendbot. Mainnet is not enabled.
            </p>
            <h3>Required public configuration</h3>
            <div className="docs-env-list">
              <code>NEXT_PUBLIC_STELLAR_HORIZON_URL</code><span>Testnet Horizon endpoint</span>
              <code>NEXT_PUBLIC_STELLAR_RPC_URL</code><span>Testnet RPC endpoint</span>
              <code>NEXT_PUBLIC_ROUTE_REGISTRY_CONTRACT_ID</code><span>Deployed registry contract</span>
              <code>NEXT_PUBLIC_SETTLEMENT_RECEIPT_CONTRACT_ID</code><span>Deployed receipt contract</span>
              <code>NEXT_PUBLIC_ROUTE_EXECUTOR_CONTRACT_ID</code><span>Deployed atomic executor</span>
              <code>NEXT_PUBLIC_PROOF_PAYMENT_DESTINATION</code><span>Testnet proof recipient</span>
              <code>NEXT_PUBLIC_TESTNET_USDC_ISSUER</code><span>Official Testnet USDC issuer</span>
            </div>
            <p className="docs-note">
              Optional provider and automation variables are documented in <ExternalLink href="https://github.com/zaejohn/AnchorScout/blob/main/web/.env.example">web/.env.example</ExternalLink>.
              API keys, database access, cron secrets, and signing material stay server-side.
            </p>
          </section>

          <section className="docs-section" id="implementation">
            <div className="docs-section-heading">
              <span>04</span>
              <div>
                <p>Implementation</p>
                <h2>How the system is built</h2>
              </div>
            </div>
            <div className="docs-architecture" role="img" aria-label="AnchorScout architecture flow">
              <div><small>UNTRUSTED CLIENT</small><strong>Wallet + Next.js UI</strong><span>request • compare • approve</span></div>
              <b aria-hidden="true">→</b>
              <div><small>SERVER BOUNDARY</small><strong>Quote API</strong><span>validate • normalize • rank</span></div>
              <b aria-hidden="true">→</b>
              <div><small>EXTERNAL DATA</small><strong>Provider adapters</strong><span>isolated • attributed • timed out</span></div>
            </div>
            <div className="docs-architecture docs-architecture-chain" role="img" aria-label="AnchorScout on-chain proof flow">
              <div><small>ONE APPROVAL</small><strong>Route Executor</strong><span>atomic contract invocation</span></div>
              <b aria-hidden="true">→</b>
              <div><small>ON-CHAIN STATE</small><strong>Registry + Receipt</strong><span>route • proof payment • outcome</span></div>
              <b aria-hidden="true">→</b>
              <div><small>PUBLIC RESULT</small><strong>History</strong><span>RPC state • Stellar Expert link</span></div>
            </div>
            <ul className="docs-principles">
              <li><strong>Browser is untrusted.</strong> Validation, credentials, and provider authorization stay on the server.</li>
              <li><strong>Provider failures are isolated.</strong> One timeout does not cancel other valid results.</li>
              <li><strong>Transactions have clear states.</strong> Prepare, sign, submit, confirm, and fail are separate UI states.</li>
              <li><strong>History is verified.</strong> The app checks the configured Testnet and canonical transaction hash.</li>
            </ul>
          </section>

          <section className="docs-section" id="providers">
            <div className="docs-section-heading">
              <span>05</span>
              <div>
                <p>Provider data</p>
                <h2>Real sources, honest limits</h2>
              </div>
            </div>
            <div className="docs-provider-list">
              <article><div><strong>Coins.ph</strong><span>Market reference or authenticated firm quote</span></div><p>Public market data supplies current order-book evidence. Firm quote and payout data appear only when the protected server adapter is fully configured.</p></article>
              <article><div><strong>MoneyGram</strong><span>Cash pickup only</span></div><p>Real Testnet SEP-1 and SEP-24 capability is checked. It is eligible only for cash pickup; the unavailable external cash step remains clearly simulated.</p></article>
              <article><div><strong>SEP-38 anchor</strong><span>Optional configured provider</span></div><p>A real anchor can supply indicative or firm quote data when its home domain and allowed quote origins are configured.</p></article>
              <article><div><strong>Onramper</strong><span>Optional supported Testnet route</span></div><p>It is registered only with a server API key and provider-issued Stellar Testnet asset IDs. Empty, blocked, generic, or Mainnet results never become route cards.</p></article>
            </div>
          </section>

          <section className="docs-section" id="contracts">
            <div className="docs-section-heading">
              <span>06</span>
              <div>
                <p>Stellar contracts</p>
                <h2>Public Testnet deployment</h2>
              </div>
            </div>
            <div className="docs-contract-list">
              {contracts.map((contract) => (
                <article key={contract.id}>
                  <div><strong>{contract.name}</strong><p>{contract.purpose}</p></div>
                  <code>{contract.id}</code>
                  <ExternalLink href={`https://lab.stellar.org/r/testnet/contract/${contract.id}`}>Open contract</ExternalLink>
                </article>
              ))}
            </div>
            <div className="docs-proof-link">
              <div><span>Verified one-sign contract call</span><strong className="landing-mono">c6948d8c…c6551e</strong></div>
              <ExternalLink href="https://stellar.expert/explorer/testnet/tx/c6948d8c82c8413f05d61e6a7f6a11f88a81838ca4a7ec414a17e074ebc6551e">View on Stellar Expert</ExternalLink>
            </div>
          </section>

          <section className="docs-section" id="verification">
            <div className="docs-section-heading">
              <span>07</span>
              <div>
                <p>Verification</p>
                <h2>Review the evidence</h2>
              </div>
            </div>
            <div className="docs-link-grid">
              <ExternalLink href="https://github.com/zaejohn/AnchorScout#level-2--yellow-belt"><strong>Level 2 proof</strong><span>Wallets, errors, contracts, status, and events</span></ExternalLink>
              <ExternalLink href="https://github.com/zaejohn/AnchorScout/actions"><strong>CI/CD</strong><span>Lint, typecheck, tests, builds, and contract checks</span></ExternalLink>
              <ExternalLink href="https://github.com/zaejohn/AnchorScout/blob/main/ARCHITECTURE.md"><strong>Architecture</strong><span>Trust boundaries, providers, state, and transaction flow</span></ExternalLink>
              <ExternalLink href="https://drive.google.com/file/d/1OyA98uTZ0VAnub3cu1voecrTvb2NwfNb/view?usp=sharing"><strong>Demo video</strong><span>Complete product walkthrough</span></ExternalLink>
            </div>
          </section>
        </article>
      </div>

      <footer className="docs-footer">
        <span>AnchorScout documentation</span>
        <span>Stellar Testnet • Mainnet disabled</span>
        <Link href="/app">Open app →</Link>
      </footer>
    </main>
  );
}
