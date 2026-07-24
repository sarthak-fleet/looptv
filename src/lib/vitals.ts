import { onLCP, onCLS, onINP, onTTFB, onFCP } from 'web-vitals';

interface VitalMetric {
  name: string;
  value: number;
  rating: string;
  id: string;
  navigationType: string;
}

function sendToAnalytics(metric: VitalMetric) {
  const posthog = (
    window as unknown as {
      posthog?: { capture?: (event: string, props: Record<string, unknown>) => void };
    }
  ).posthog;
  if (posthog && typeof posthog.capture === 'function') {
    posthog.capture('web_vital', {
      name: metric.name,
      value: Math.round(metric.value),
      rating: metric.rating,
      id: metric.id,
      navigation_type: metric.navigationType,
    });
  } else {
    const body = JSON.stringify({
      project: import.meta.env.PUBLIC_PROJECT_SLUG ?? 'looptv',
      ...metric,
    });
    navigator.sendBeacon('https://vitals.fleet.workers.dev/collect', body);
  }
}

export function initVitals() {
  onLCP(sendToAnalytics);
  onCLS(sendToAnalytics);
  onINP(sendToAnalytics);
  onTTFB(sendToAnalytics);
  onFCP(sendToAnalytics);
}
