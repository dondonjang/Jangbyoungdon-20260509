# AGENTS.md

Project instructions for AI coding agents working in this repository.

## Project Snapshot

- Product: `장바구니 비서`, a Korean shopping assistant.
- Main user flow: chat receives a product name or product link, analyzes and saves it, then `자주 사는 상품` shows same-product and similar-product recommendations.
- Runtime target: Vercel. Do not reintroduce Cloudflare/Wrangler configuration.
- Stack: TanStack Start, TanStack Router, React 19, Vite, Tailwind CSS v4, shadcn/Radix UI components, Bun lockfile.
- Backend shape: TanStack Start server functions with server-only services under `src/server/*`.
- Planned external services: OpenAI API for structured product intelligence, external page scraping/parsing API or service for product pages.

## Commands

- Install/update dependencies: `bun install`
- Dev server: `bun run dev`
- Production build: `bun run build`
- Lint: `bun run lint`
- Format: `bun run format`

Before claiming completion for code changes, run `bun run build`. Run `bun run lint` when touching TypeScript/React files; existing shadcn UI fast-refresh warnings may remain unless the task is specifically to clean them up.

## Source Map

- `src/routes/index.tsx`: top-level app screen and tab orchestration.
- `src/components/ChatTab.tsx`: chat input and analysis result CTA.
- `src/components/AnalysisTab.tsx`: `자주 사는 상품` list and recommendation display.
- `src/lib/product-types.ts`: canonical shared product-analysis types and small shared helpers.
- `src/lib/product-functions.ts`: client-importable TanStack Start server function wrappers.
- `src/server/services/product-analysis.ts`: product analysis orchestration.
- `src/server/services/scrape-page.ts`: server-only HTML fetch/parsing helper.
- `src/server/services/openai-product-intel.ts`: server-only OpenAI integration point.
- `src/server/repositories/*`: persistence boundary. Current in-memory implementation is temporary.

## Architecture Rules

- Keep `src/lib/product-types.ts` as the canonical shape for product analysis results.
- Client-importable server function wrappers belong outside `src/server/*`; actual server-only logic belongs inside `src/server/*`.
- Never import `src/server/*` directly from React components or routes except inside `createServerFn().handler(...)` dynamic imports.
- Frontend should call one orchestration function for the primary flow, not separate scrape/OpenAI calls.
- Keep OpenAI keys, scrape credentials, DB URLs, and other secrets inside server-only code.
- Store parsed/structured product data, not raw scraped HTML, unless explicitly required for debugging.
- Treat scraping failure as an expected path with a user-recoverable state.

## Product Language

- Use `자주 사는 상품`, not `상품 분석`, for the saved-products surface.
- The chat should accept both product names and product links.
- The recommendations surface should distinguish `동일 상품` from `유사 추천 상품`.
- Avoid UI that looks like a filter unless it actually filters. The chat screen should not show the old `분석한 상품` chip list.

## Code Style

- Follow `.omx/rules/code-review-and-writing.md` when present.
- Prefer clean, direct code with a single source of truth.
- Do not over-split. Extract only when it clarifies a real boundary, meaningful reuse, or independent change path.
- Prefer existing helpers, types, and component patterns before adding new abstractions.
- Do not add dependencies unless the user explicitly asks or the need is well justified.
- Keep comments rare and focused on why a decision exists.
- Keep changes scoped. Do not mix unrelated formatting or refactors into feature work.

## Frontend Rules

- Use existing UI components from `src/components/ui/*`.
- Use `lucide-react` icons when an icon is needed.
- Keep operational UI compact and task-focused.
- Do not create marketing/landing-page layouts for this app.
- Verify UI changes in the browser when they affect visible flows.

## Backend Rules

- Use TanStack Start server functions for the app backend while the project stays on Vercel.
- Use structured schemas for OpenAI outputs before connecting them to UI state.
- Keep provider boundaries replaceable: mock/fallback, scrape provider, OpenAI provider, and persistence should be swappable without changing components.
- Replace the in-memory repository before relying on persistence in Vercel production.

## Git And Safety

- This workspace may not be a git repository. Check before using git assumptions.
- Never revert user changes unless explicitly asked.
- Never run destructive commands such as `git reset --hard` or deleting large directories unless the user explicitly asks.
- `.omx/` and `.omc/` are local agent workspace folders and are ignored by git in this project.

## Completion Checklist

- Code matches the product flow.
- SSoT is preserved for product types and helpers.
- No server-only imports leak into client bundles.
- `bun run build` passes.
- `bun run lint` has no new errors.
- Browser verification is done for visible UI changes.
