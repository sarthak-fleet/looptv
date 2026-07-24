## Why

LoopTV is a static, route-rich site with a browser-only player, but it currently
uses Next.js solely to export static files. Astro matches the product's static
delivery model while allowing the interactive player and personal-library
surfaces to remain React islands.

## What Changes

- Replace the Next.js static-export shell with Astro and the official React
  integration.
- Preserve every public route, station permalink, metadata surface,
  machine-readable export, and browser-only playback feature.
- Keep the checked-in catalog, localStorage state, YouTube player behavior,
  analytics, feedback widget, and existing catalog workflows unchanged.
- Emit the Cloudflare Pages artifact from `dist/` and retain cache headers for
  catalog assets.
- Remove Next.js-only dependencies, configuration, and source conventions.
- Update stack, build, deployment, and architecture documentation.

## Capabilities

### New Capabilities

- `astro-static-delivery`: Defines Astro page generation, React-island
  hydration, route parity, metadata parity, and static export requirements.

### Modified Capabilities

None.

## Impact

The application package, page/component organization, package lock, Cloudflare
Pages output directory, and stack documentation change. Catalog generation,
scheduled workflows, public URLs, client storage schemas, external services,
and production deployment remain unchanged. Astro, `@astrojs/react`, and the
Tailwind Vite plugin replace Next.js and its PostCSS build integration.
