# Codex Model Routing

The repository uses custom subagents so the main thread can stay focused on synthesis and implementation.

- Main Codex: `gpt-5.6` (Sol) — architecture, synthesis, implementation, hard debugging.
- `stellar_researcher`: `gpt-5.6-luna`, xhigh — current docs/ecosystem research.
- `code_mapper`: `gpt-5.6-luna`, xhigh — read-heavy repository mapping.
- `test_runner`: `gpt-5.6-terra`, medium — noisy builds/tests.
- `contract_reviewer`: `gpt-5.6-sol`, high — high-rigor contract review.
- `app_reviewer`: `gpt-5.6-terra`, high — integration review.

If your Codex plan does not expose one of these model slugs, replace only the `model =` line in the corresponding `.codex/agents/*.toml` file with an available equivalent. Keep the role separation.

## Next.js full-stack work

Use the main agent for implementation synthesis. Delegate read-only application review to `app_reviewer` after meaningful authentication, authorization, payment, wallet, webhook, or cross-boundary changes. Use `$nextjs-fullstack` for vertical features spanning UI and backend behavior.
