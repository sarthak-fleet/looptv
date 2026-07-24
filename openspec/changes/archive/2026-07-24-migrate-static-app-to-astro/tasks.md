## 1. Astro foundation

- [x] 1.1 Replace Next package scripts and dependencies with Astro, the React integration, Tailwind Vite, and Lightning CSS
- [x] 1.2 Add Astro configuration, shared layout, global styles, and Cloudflare Pages `dist/` output
- [x] 1.3 Preserve global metadata, structured data, icons, analytics, feedback, and web-vitals behavior

## 2. Route and island migration

- [x] 2.1 Port landing, catalog, channel-directory, about, privacy, and terms pages to static Astro pages
- [x] 2.2 Port configured station permalinks to generated Astro routes with station-specific metadata
- [x] 2.3 Mount playback, random, stats, tags, history, playlist, watch-later, and blocked React surfaces as client islands
- [x] 2.4 Replace Next navigation imports in reachable React components
- [x] 2.5 Recreate manifest, robots, sitemap, security, humans, stations JSON, tags JSON, and OPML outputs at their existing URLs
- [x] 2.6 Remove Next-only application/configuration files and regenerate the package lock

## 3. Documentation and verification

- [x] 3.1 Update AGENTS, status, architecture, development, deployment, and route documentation for Astro
- [x] 3.2 Run unit tests, typecheck, lint, docs validation, production build, and route/artifact parity checks
- [x] 3.3 Validate and archive the OpenSpec change after all checks pass
