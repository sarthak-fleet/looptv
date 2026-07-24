import { AnalyticsProvider } from './posthog-provider';
import { SaaSMakerFeedback } from './saasmaker-feedback';
import { VitalsReporter } from './VitalsReporter';

export default function ClientServices() {
  return (
    <AnalyticsProvider>
      <SaaSMakerFeedback />
      <VitalsReporter />
    </AnalyticsProvider>
  );
}
