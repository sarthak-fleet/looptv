/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_POSTHOG_KEY?: string;
  readonly PUBLIC_POSTHOG_HOST?: string;
  readonly PUBLIC_PROJECT_SLUG?: string;
  readonly PUBLIC_SAASMAKER_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
