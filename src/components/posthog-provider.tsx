'use client';

// posthog-js + PostHogProvider intentionally NOT imported at module top.
// `lib/analytics` lazy-imports posthog-js inside its emit() path; the React
// `<PostHogProvider>` was wrapping `{children}` but no descendant uses
// `usePostHog`, so dropping it removes ~50 KB from the LCP-critical main
// chunk (psi-swarm coverage flagged the waste).
import { useEffect } from 'react';

import { trackReturned, trackSignup } from '@/lib/analytics';
import { installBrowserMonitoring } from '@/lib/foundry-monitoring';
import { getStats } from '@/lib/watched';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return installBrowserMonitoring();
  }, []);

  // Fixed taxonomy: `signup` on the first-ever visit, `returned` on a later
  // session for a device that already has watch history. Both de-dupe
  // internally, so it is safe to call them on every mount.
  useEffect(() => {
    const hasPriorActivity = getStats().totalWatched > 0;
    if (hasPriorActivity) {
      trackReturned(true);
    } else {
      trackSignup();
    }
  }, []);

  return <>{children}</>;
}
