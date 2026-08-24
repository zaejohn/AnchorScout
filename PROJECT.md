# AnchorScout

## Product

AnchorScout is a **Stellar route-comparison dApp** that demonstrates how users can compare multiple Stellar Anchor payment routes before choosing how to send funds.

The application focuses on a complete, technically verifiable Stellar Testnet experience.

A user enters:

- Amount
- Source asset
- Target currency
- Payout method

AnchorScout retrieves available compatible quotes, normalizes them into a common format, ranks the routes, and shows which option gives the best expected result.

Example:

```text
Send: 100 USDC
Receive: PHP

Route A — ₱5,680
Route B — ₱5,740 ← Best
Route C — ₱5,710
```

The user selects a route and signs the required Stellar transactions from their own wallet.

AnchorScout never holds user funds.

---

# 1. Core Goal

The MVP must prove this complete flow:

```text
Connect wallet
      ↓
View balances
      ↓
Search Anchor routes
      ↓
Fetch multiple quotes
      ↓
Normalize and rank routes
      ↓
Select a valid route
      ↓
Sign Stellar transaction
      ↓
Record selection on Soroban
      ↓
Process settlement flow
      ↓
Record settlement receipt
      ↓
Receive real-time contract updates
      ↓
View completed route and transaction evidence
```

---

# 2. Network Scope

The MVP must not implement Mainnet infrastructure unless the project scope is intentionally changed later.

Do not spend development time on:

- Mainnet RPC configuration
- Mainnet contract deployment
- Production USDC
- Real PHP settlement
- Real bank payouts
- Production liquidity
- Production KYC
- Production Anchor partnerships
- Mainnet secrets
- Mainnet monitoring
- Mainnet fee optimization

---

# 3. Technology Stack

## Application

Use:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Next.js Server Components
- Next.js Client Components only where required
- Server Actions where appropriate
- Route Handlers for APIs and external callbacks
- Vercel for deployment

Next.js acts as both the frontend and backend.

Do not introduce a separate backend service unless there is a concrete technical requirement.

---

## Stellar

Use current supported Stellar tooling and verify version-sensitive behavior using official Stellar documentation, Stellar Dev Skills, and Raven.

Expected technologies:

- Stellar SDK
- StellarWalletsKit
- Stellar RPC
- Horizon where useful
- Soroban
- Stellar CLI
- Stellar Testnet
- Local Stellar Quickstart

Relevant Anchor standards:

- SEP-1
- SEP-38
- SEP-24 where feasible
- SEP-31 where feasible

SEP-38 and route comparison are the most important Anchor-related functionality.

---

# 4. Wallet Support

AnchorScout must support multiple Stellar wallets using **StellarWalletsKit**.

The UI must allow users to:

- Open wallet selection
- See available wallet options
- Connect a supported wallet
- Disconnect the wallet
- Reconnect after refresh where appropriate
- View the connected public address
- Detect the active Stellar network
- Require or clearly enforce Stellar Testnet

Freighter must be supported.

Other wallets supported by the currently installed StellarWalletsKit may also be exposed.

---

# 5. Wallet Balances

After wallet connection, display:

- XLM balance
- Asset balances relevant to AnchorScout

At minimum, the connected user's **XLM balance must always be available and clearly displayed**.

Balance retrieval must include:

- Loading state
- Empty state
- RPC/API failure state
- Refresh capability

---

# 6. XLM Transaction

AnchorScout must include a small **Wallet Utility** that proves the fundamental Stellar transaction flow.

The user can:

1. Enter a Stellar destination address.
2. Enter an XLM amount.
3. Review the transfer.
4. Sign using the connected wallet.
5. Submit the transaction to Stellar.
6. View transaction status.

Required states:

```text
Preparing
Waiting for signature
Submitted
Confirmed
Failed
Rejected
```

After success, display:

- Confirmation message
- Transaction hash
- Explorer link where available

---

# 7. Error Handling

The application must explicitly handle at least these wallet/transaction errors:

## Wallet Not Found

Example:

```text
No supported Stellar wallet was detected.
```

Provide a useful recovery action.

---

## User Rejected Transaction

A rejected wallet signature is a normal user state.

It must not be displayed as an unexpected application crash.

---

## Insufficient Balance

Detect insufficient XLM or asset balance before or during transaction preparation.

Provide a clear message.

---

Additional required error cases include:

- Wrong Stellar network
- Invalid Stellar address
- RPC unavailable
- Horizon unavailable
- Anchor unavailable
- Quote API failure
- Malformed quote
- Quote expired
- No routes available
- Transaction simulation failure
- Transaction submission failure
- Transaction confirmation timeout
- Soroban invocation failure
- Settlement failure

One failing Anchor must not prevent valid quotes from other Anchors from being shown.

---

# 8. Route Request

The user enters:

- Amount
- Source asset
- Destination currency
- Payout method

Example:

```text
Amount:
100

Source:
Test USDC

Receive:
PHP

Payout:
Bank
```

Input must be validated before requesting quotes.

---

# 9. Assets

The MVP may use:

- Testnet XLM
- Testnet USDC

Asset issuer and asset metadata should be documented in `NETWORKS.md`.

---

# 10. Anchor Discovery

AnchorScout maintains a configurable registry of Anchor providers available to the application.

Where reliable public Anchors are available, use their actual endpoints.

The architecture must not depend on production Anchor availability.

The MVP should support approximately:

```text
2–4 route providers
```

Providers can include:

- Real compatible Stellar Anchor endpoints
- Clearly labeled demo Anchor adapters

Demo adapters must implement the same normalized interface as real providers.

---

# 11. SEP-1

Where supported, use SEP-1 to retrieve Anchor metadata and capabilities.

AnchorScout should use SEP-1 information to help determine:

- Supported services
- Available endpoints
- Relevant currencies/assets
- Anchor metadata

Failure to retrieve SEP-1 metadata from one Anchor must not break route discovery for other configured providers.

---

# 12. SEP-38 Quotes

SEP-38-style quote comparison is the primary AnchorScout feature.

Each provider should return or be normalized into information such as:

```text
Anchor
Quote ID
Source asset
Source amount
Destination currency
Destination amount
Exchange rate
Fee
Payout method
Estimated processing time
Expiration
Availability
```

Quotes must have expiration handling.

Expired quotes cannot be executed.

---

# 13. Quote Normalization

Create one normalized internal route model.

Conceptually:

```text
AnchorQuote {
  anchor
  quoteId
  sourceAsset
  sourceAmount
  destinationCurrency
  destinationAmount
  exchangeRate
  fee
  payoutMethod
  estimatedTime
  expiresAt
  status
}
```

The comparison UI must consume this normalized representation.

Do not put Anchor-specific response parsing inside UI components.

---

# 14. Anchor Adapter Architecture

Each Anchor integration implements a common provider interface.

```text
Anchor A ─┐
          │
Anchor B ─┼──→ Anchor Adapter Layer
          │
Anchor C ─┘
                ↓
         Normalized Quotes
                ↓
          Ranking Engine
                ↓
         Comparison UI
```

Adding another Anchor should primarily require creating another adapter rather than changing the entire route-comparison system.

---

# 15. Route Ranking

Default ranking should prioritize:

1. Highest valid destination amount
2. Lowest total fee
3. Quote validity
4. Route availability
5. Estimated processing time

Example:

```text
100 USDC → PHP

#1 Route B
₱5,740
Fee: 0.8 USDC
~5 min

#2 Route C
₱5,710
Fee: 0.5 USDC
~10 min

#3 Route A
₱5,680
Fee: 1 USDC
~3 min
```

Ranking must be deterministic and independently testable.

Do not label a route as "Best" if required comparison data is missing.

---

# 16. Quote Expiration

Possible quote states:

```text
LOADING
AVAILABLE
SELECTED
EXPIRED
UNAVAILABLE
FAILED
```

When a quote expires:

```text
Quote expires
      ↓
Route becomes unavailable
      ↓
Selection disabled
      ↓
User can refresh quotes
```

The UI should update without requiring a full-page reload.

---

# 17. Soroban Contracts

AnchorScout uses **two Soroban contracts** on Stellar.

Keeping two contracts is intentional because the project must demonstrate meaningful inter-contract communication.

The contracts must remain small and understandable.

---

## Contract A — Route Registry

Purpose:

Record a user's selected route.

Possible state:

```text
route_id
user
anchor_id
source_asset
source_amount
destination_currency
quote_hash
selected_at
status
```

Responsibilities:

- Require appropriate user authorization
- Create route record
- Prevent invalid state transitions
- Expose route state
- Emit route events
- Communicate with Settlement Receipt when settlement completes

Do not store sensitive fiat, banking, KYC, or wallet-secret information.

---

## Contract B — Settlement Receipt

Purpose:

Record the outcome of a route.

Possible state:

```text
receipt_id
route_id
transaction_hash
status
completed_at
```

Statuses:

```text
PENDING
COMPLETED
FAILED
```

Responsibilities:

- Create settlement receipt
- Associate receipt with Route Registry entry
- Emit settlement events
- Notify or invoke Route Registry when finalizing a route

---

# 18. Inter-Contract Communication

The two contracts must communicate during settlement.

Expected flow:

```text
User selects route
       ↓
Route Registry
creates route
       ↓
RouteSelected event
       ↓
Payment flow
       ↓
Settlement Receipt
records outcome
       ↓
Settlement Receipt calls
Route Registry
       ↓
Route Registry updates
final route status
       ↓
RouteCompleted event
```

The implementation should demonstrate actual Soroban cross-contract invocation rather than merely having two unrelated contracts.

---

# 19. Contract Events

Contracts must emit meaningful events.

Examples:

```text
RouteSelected
RouteStatusChanged
SettlementRecorded
RouteCompleted
RouteFailed
```

Events should contain only non-sensitive information necessary for application synchronization.

---

# 20. Real-Time Event Integration

The frontend/backend must synchronize application state from Stellar contract activity.

When relevant contract events occur:

```text
Soroban event
     ↓
event/indexing layer
     ↓
application state refresh
     ↓
UI updates
```

Examples:

- Selected route appears in activity/history
- Pending route becomes completed
- Failed settlement updates the route
- New settlement receipt becomes visible

Use a practical compatible polling/indexing strategy if true push-based subscriptions are unnecessary.

The goal is observable near-real-time synchronization, not unnecessary infrastructure complexity.

---

# 21. Payment Flow

A selected route should create real Stellar activity.

Possible MVP flow:

```text
User wallet
     ↓
sign transaction
     ↓
USDC/XLM transfer
     ↓
configured destination
     ↓
transaction confirmed
     ↓
settlement recorded
```

The purpose is proving the complete Stellar transaction lifecycle.

---

# 22. Transaction Tracking

Every meaningful transaction should expose status.

Possible application states:

```text
Preparing
Simulating
Awaiting Signature
Signed
Submitting
Pending
Confirmed
Failed
Rejected
Expired
```

The UI must never treat transaction submission as equivalent to final confirmation.

Where applicable, display:

- Transaction hash
- Contract invocation transaction
- Explorer link
- Confirmation state

---

# 23. Route History

Users can view previous route selections associated with their wallet.

Display:

- Route ID
- Anchor
- Source amount
- Destination amount
- Fee
- Selected date
- Current status
- Stellar transaction
- Settlement receipt
- Relevant explorer links

History should use actual Soroban records where applicable rather than being purely temporary client state.

---

# 24. Frontend Architecture

Use Next.js App Router.

Prefer:

- Server Components by default
- Client Components only for browser/wallet/interactivity requirements
- Server Actions for appropriate first-party mutations
- Route Handlers for Anchor APIs and external integrations

Suggested structure:

```text
web/src/
├── app/
├── components/
├── features/
├── lib/
│   ├── server/
│   ├── stellar/
│   └── anchors/
└── types/
```

Do not mix blockchain/provider logic directly into presentation components.

---

# 25. Backend Architecture

Next.js server-side functionality handles:

- Anchor discovery
- Quote retrieval
- Quote normalization
- Ranking
- Quote-expiration validation
- Provider health
- Transaction lookup
- Event synchronization
- History aggregation

Example:

```text
UI
 ↓
Next.js server layer
 ↓
Route Service
 ↓
Anchor Adapter Layer
 ↓
Anchor/Test Providers
```

Stellar-specific services should remain separated from general domain logic where practical.

---

# 26. Loading States

Every network-dependent operation must expose useful loading feedback.

Examples:

- Connecting wallet
- Loading balances
- Discovering Anchors
- Fetching quotes
- Refreshing quotes
- Simulating transaction
- Waiting for wallet signature
- Submitting transaction
- Waiting for confirmation
- Loading history
- Loading contract events

Avoid blank screens and unexplained disabled buttons.

---

# 27. Mobile Responsive UI

The complete primary product flow must work well on:

- Mobile
- Desktop

Important mobile views include:

- Wallet connection
- Balance display
- Route request
- Quote comparison
- Route details
- Transaction status
- History

Route cards may replace wide comparison tables on small screens.

No required action should depend on desktop-only layouts.

---

# 28. UX Direction

AnchorScout should feel like a modern financial comparison application.

Primary experience:

```text
Enter payment
      ↓
Compare routes
      ↓
Understand differences
      ↓
Choose route
      ↓
Sign
      ↓
Track result
```

Priorities:

- Clear financial numbers
- Fast comparison
- Strong hierarchy
- Minimal steps
- Mobile-first
- Accessible UI
- Excellent error feedback
- Obvious indicators
- Clear wallet status
- Clear transaction status

Avoid:

- Generic admin-dashboard appearance
- Excessive gradients
- Excessive animations
- Unnecessary modals
- Huge blocks of explanatory text
- Fake financial claims
- Hidden fees

---

# 29. Testing

Testing is mandatory for both Soroban and frontend/domain logic.

## Contract Tests

At minimum test:

- Route creation
- Authorization
- Invalid authorization
- Duplicate route behavior
- Invalid state transitions
- Settlement receipt creation
- Contract-to-contract communication
- Completed settlement
- Failed settlement
- Event emission

The contract suite must contain substantially more than the minimum three passing tests.

---

## Frontend / Domain Tests

Test:

- Quote normalization
- Quote ranking
- Expiration
- Missing quote fields
- Provider failure isolation
- Invalid route requests
- Transaction-state mapping
- Important utility/domain functions

---

## Integration Tests

Where practical, test:

```text
route request
→ provider adapters
→ normalization
→ ranking
```

and:

```text
route selection
→ contract call
→ emitted event
→ synchronized state
```

---

# 30. CI/CD

Use GitHub Actions.

The CI pipeline should run automatically on relevant pushes and pull requests.

At minimum:

```text
Install dependencies
      ↓
Next.js lint
      ↓
TypeScript check
      ↓
Frontend/domain tests
      ↓
Next.js production build
      ↓
Rust contract tests
      ↓
Soroban contract build
```

CI must fail when required checks fail.

---

# 31. Smart Contract Deployment Workflow

Provide repeatable scripts or documented commands for:

```text
Build contracts
     ↓
Run tests
     ↓
Deploy Route Registry
     ↓
Deploy Settlement Receipt
     ↓
Initialize/configure contracts
     ↓
Verify contract call
     ↓
Save public deployment evidence
```

Only Stellar Testnet deployment is required.

Deployment output should update or provide the information needed for `NETWORKS.md`.

Never commit secret keys.

---

# 32. Application Deployment

The Next.js application will be deploy to **Vercel**.

The deployed build must use Stellar configuration.

Required deployment characteristics:

- HTTPS
- Functional wallet connection
- Functional calls
- Responsive frontend
- Production build succeeds
- Environment secrets remain server-side

---

# 33. Analytics

Use **Vercel Web Analytics only**.

Do not add unnecessary analytics platforms.

Track basic product traffic using Vercel Analytics.

Where useful, application-level counters can also expose anonymous/non-sensitive product metrics such as:

- Quote searches
- Routes returned
- Routes selected
- Successful transactions
- Failed transactions

Do not send:

- Wallet secret keys
- Sensitive wallet data
- KYC data
- Banking data

to analytics.

---

# 34. Performance

Optimize the critical route-comparison experience.

Priorities:

- Parallel Anchor quote requests
- Per-provider timeout
- Failure isolation
- Avoid sequential requests when unnecessary
- Avoid repeated RPC calls
- Appropriate server-side caching for non-user-specific Anchor metadata
- Avoid unnecessary client JavaScript
- Server Components where appropriate
- Responsive wallet interaction

Route results should appear progressively where practical rather than waiting indefinitely for a slow provider.

---

# 35. Production-Style Project Structure

- Clear feature boundaries
- No giant components
- No giant route handlers
- No duplicated business logic
- Typed domain models
- Input validation
- Explicit error handling
- Server-only secrets
- Reusable Anchor adapter interface
- Reusable Stellar service layer
- Clear contract/frontend boundary
- Generated contract bindings where practical
- Environment validation
- No placeholder production logic hidden behind successful UI states

---

# 36. Security Rules

Never:

- Store wallet seed phrases
- Store wallet private keys
- Ask users for private keys
- Sign user transactions server-side
- Commit deployment secrets
- Store sensitive payout information on-chain
- Trust browser-provided authorization
- Treat submitted transactions as confirmed
- Expose private server environment variables

Wallet signatures must remain user-controlled.

---

# 37. Monitoring

Keep monitoring intentionally lightweight.

Use:

- Vercel deployment/runtime logs
- Vercel Analytics
- Clear application error logging

Do not add Sentry, PostHog, Datadog, or another monitoring platform unless a concrete requirement appears later.

---

# 38. Development Workflow

Build complete vertical slices rather than generating all layers independently.

Example:

```text
Feature
  ↓
domain model
  ↓
backend/service
  ↓
Stellar interaction
  ↓
frontend
  ↓
loading/errors
  ↓
tests
  ↓
verification
  ↓
commit
```

Recommended progression:

```text
Phase 1
Project foundation + CI

Phase 2
Multi-wallet + balance + XLM transfer

Phase 3
Anchor providers + quote engine

Phase 4
Route comparison UI

Phase 5
Route Registry contract

Phase 6
Settlement Receipt contract

Phase 7
Inter-contract communication + events

Phase 8
Route execution + transaction tracking

Phase 9
Real-time synchronization + history

Phase 10
Responsive polish + analytics + deployment

Phase 11
Final verification + documentation
```

---

# 39. Commit Standards

Maintain at least:

> **15+ meaningful commits**

Prefer small logical commits associated with completed development milestones.

Examples:

```text
feat: add multi-wallet connection
feat: display stellar balances
feat: add xlm transaction flow
feat: implement anchor adapter interface
feat: add sep-38 quote normalization
feat: implement route ranking
feat: add route registry contract
test: cover route registry authorization
feat: add settlement receipt contract
feat: add inter-contract settlement flow
feat: synchronize route events
feat: add transaction history
ci: add frontend and contract checks
feat: add vercel analytics
docs: document deployment
```

Do not create meaningless commits solely to inflate the commit count.

---

# 40. README Evidence

The final `README.md` should make technical verification easy.

It should contain:

## Project

- Product description
- Problem
- How AnchorScout works
- Why Stellar

## Setup

- Requirements
- Installation
- Environment configuration
- How to run Next.js
- How to run contract tests
- How to deploy contracts

## Architecture

- Application architecture
- Anchor adapter architecture
- Contract architecture
- Inter-contract flow

## Stellar Testnet

- Network
- Test asset information
- Route Registry contract address
- Settlement Receipt contract address
- Example contract transaction hash
- Example XLM transaction hash
- Explorer links

## Feature Evidence

Include screenshots showing:

- Available wallet options
- Connected wallet
- XLM balance
- Successful XLM transaction
- Transaction result/hash
- Route comparison
- Selected route
- Transaction pending/success state
- Contract-backed route history
- Mobile responsive UI
- Vercel Analytics
- Passing tests
- Successful CI workflow

The README should organize this evidence clearly so reviewers can verify functionality quickly.

---

# 41. Belt Coverage Built Into the Product

The implementation should naturally satisfy the technical requirements across the Stellar builder progression.

## Foundation

AnchorScout includes:

- Freighter
- Stellar Testnet
- Wallet connect/disconnect
- XLM balance
- XLM transfer
- Transaction success/failure
- Transaction hash

## Multi-Wallet + Smart Contract

AnchorScout includes:

- StellarWalletsKit
- Multiple wallet options
- Wallet error handling
- Soroban contracts deployed
- Contract calls from the frontend
- Pending/success/failure states
- Contract events
- State synchronization

## Advanced dApp

AnchorScout includes:

- Two Soroban contracts
- Inter-contract communication
- Event-driven updates
- CI/CD
- Contract deployment workflow
- Mobile-responsive UI
- Frontend and contract tests
- Loading/error states
- Production-style architecture
- Documentation

## Polished MVP

AnchorScout includes:

- Stable frontend/backend architecture
- Stable smart contract architecture
- Vercel deployment
- Vercel Analytics
- Performance optimization
- Error monitoring through Vercel/runtime logs
- Optimized onboarding
- Proper project structure
- Public technical evidence
- 15+ meaningful commits

---

# 42. Explicit Non-Goals

The MVP does not require:

- Stellar Mainnet
- Mainnet deployment code
- Production USDC
- Production liquidity
- Real PHP settlement
- Real bank transfers
- Real GCash transfers
- Production KYC
- Custody
- Fiat infrastructure
- Licensing infrastructure
- Production Anchor agreements
- Native mobile application
- Microservices
- Redis unless technically justified
- Kubernetes
- Custom analytics platform
- AI features unrelated to routing
- Production-scale monitoring

Do not implement these unless the project scope is explicitly changed.

---

# 43. Definition of Done

AnchorScout is technically complete when the following end-to-end experience works:

```text
Open deployed application
        ↓
Choose Stellar wallet
        ↓
Connect
        ↓
View XLM balance
        ↓
Successfully send XLM
        ↓
Enter AnchorScout route request
        ↓
Fetch multiple routes
        ↓
Normalize quotes
        ↓
Compare and rank routes
        ↓
Select valid quote
        ↓
Wallet signs transaction
        ↓
Route Registry records selection
        ↓
Payment/demo settlement executes
        ↓
Settlement Receipt records result
        ↓
Contracts communicate
        ↓
Events are detected
        ↓
UI updates route status
        ↓
Completed route appears in history
```

And all technical quality gates pass:

- Multi-wallet connection works
- Freighter works
- Connect/disconnect works
- XLM balance is correct
- XLM transfer works
- Transaction feedback works
- At least three major wallet/transaction errors are handled
- Quote normalization works
- Route ranking is deterministic
- Expired quotes cannot be selected
- Provider failure isolation works
- Route Registry is deployed
- Settlement Receipt is deployed
- Frontend calls Soroban contracts
- Inter-contract communication works
- Contract events are emitted
- Event/state synchronization works
- Transaction pending/success/failure states work
- Contract tests pass
- Frontend/domain tests pass
- At least 3 meaningful automated tests are demonstrably passing
- Next.js lint passes
- TypeScript checks pass
- Next.js production build passes
- Soroban contract build passes
- GitHub Actions CI passes
- Vercel deployment works
- Mobile layout works
- Vercel Analytics is enabled
- Vercel/runtime error logs are available
- Contract addresses are documented
- Example transaction hashes are documented
- `NETWORKS.md` contains public Testnet deployment evidence
- README contains clear verification evidence
- Repository contains at least 15 meaningful commits

The final engineering objective is:

> **Build one polished AnchorScout application that demonstrates the complete Stellar developer journey on wallets, balances, transactions, multi-wallet support, Soroban contracts, inter-contract communication, events, testing, CI/CD, analytics, responsive UX, and deployment.**
