'use client';

import type { PlaybackDiagnostic } from '@/lib/playback-diagnostics';

interface Props {
  diagnostic: PlaybackDiagnostic;
  refreshing?: boolean;
  variant?: 'overlay' | 'inline';
  onRetryCatalog?: () => void;
  onOpenHealth?: () => void;
  onSearch?: () => void;
  onDismiss?: () => void;
}

export default function PlaybackDiagnosticsBanner({
  diagnostic,
  refreshing = false,
  variant = 'overlay',
  onRetryCatalog,
  onOpenHealth,
  onSearch,
  onDismiss,
}: Props) {
  const action =
    diagnostic.action === 'retry_catalog'
      ? { label: refreshing ? 'Retrying…' : 'Retry', onClick: onRetryCatalog, disabled: refreshing }
      : diagnostic.action === 'open_health'
        ? { label: 'Channel health', onClick: onOpenHealth, disabled: false }
        : diagnostic.action === 'search'
          ? { label: 'Search', onClick: onSearch, disabled: false }
          : null;

  return (
    <div
      className={`rounded-lg border border-yellow-400/25 bg-black/80 px-4 py-3 text-sm shadow-lg backdrop-blur ${
        variant === 'overlay' ? 'absolute left-3 right-3 top-3 z-10 mx-auto max-w-xl' : 'w-full'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-yellow-200">{diagnostic.headline}</p>
          {diagnostic.detail && <p className="mt-0.5 text-white/55">{diagnostic.detail}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          {action?.onClick && (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="rounded-lg bg-white/10 px-3 py-2 text-white transition-colors hover:bg-white/15 disabled:cursor-wait disabled:opacity-60"
            >
              {action.label}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Dismiss channel health notification"
              title="Dismiss"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
