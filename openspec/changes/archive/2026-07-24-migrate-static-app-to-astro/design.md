## Context

LoopTV has no server runtime, database, or account system. Next.js currently
pre-renders static pages and browser-only React applications, while checked-in
catalog files and localStorage own all runtime state. The migration must retain
SEO-friendly route output and machine-readable files while removing the
unneeded Next.js layer.

## Goals / Non-Goals

**Goals:**

- Generate content and station routes with Astro.
- Hydrate only playback and personal-library React surfaces.
- Preserve all public URLs, metadata, catalog assets, and browser behavior.
- Continue deploying a static artifact to Cloudflare Pages.

**Non-Goals:**

- Change catalog generation, refresh schedules, tags, or quality gates.
- Change player selection, YouTube embed handling, localStorage schemas, or UX.
- Add authentication, a database, SSR, or a server API.
- Deploy the migration.

## Decisions

### Use Astro pages with React islands

Static marketing, catalog, legal, metadata, and station-index pages become
Astro pages. `TVApp` and browser-state screens remain React components hydrated
with `client:load`. This retains current behavior while avoiding a
site-wide client router.

Alternative considered: a Vite SPA. It would simplify file conversion but
would weaken static route HTML and metadata for station and catalog pages.

### Generate machine-readable endpoints at build time

Astro prerendered endpoint files replace Next route handlers for
`stations.json`, `tags.json`, `export.opml`, `humans.txt`, sitemap, manifest,
robots, and security.txt. Existing checked-in public files remain static.

### Keep source data and runtime state unchanged

`channels.config.ts`, `stations.json`, `public/catalog.json`,
`public/catalog-summary.json`, and all localStorage keys remain unchanged.
React components continue reading the same assets and state.

### Use the fleet-standard Astro CSS pipeline

Astro uses the official React integration, Tailwind v4 Vite plugin, and
Lightning CSS. The output directory becomes `dist/`, matching the fleet static
deployment standard.

## Risks / Trade-offs

- [A route or metadata surface could disappear] → Inventory current build
  output and compare route files after the Astro build.
- [A browser-only component could render on the server] → Hydrate the existing
  interactive roots as client-only islands and keep browser access inside
  effects or guarded modules.
- [Next Link/navigation imports could remain] → Remove them from reachable
  source and enforce typecheck/build.
- [Catalog headers could regress] → Preserve `_headers` and its validator
  behavior in the generated artifact.

## Migration Plan

1. Add Astro, React, Tailwind, and Lightning CSS configuration.
2. Add the shared layout and static page/endpoint routes.
3. Move or adapt interactive React pages into Astro islands.
4. Remove Next-only application files, configuration, and dependencies.
5. Regenerate the lockfile and run unit, typecheck, lint, docs, and build gates.
6. Compare the old and new route inventories.
7. In a separately approved release, deploy a Pages preview, smoke guest flows,
   and retain the prior deployment for rollback.

## Open Questions

None for local implementation.
