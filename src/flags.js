const { PostHog } = require('posthog-node');

const ph = process.env.POSTHOG_KEY
  ? new PostHog(process.env.POSTHOG_KEY, {
      host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
      personalApiKey: process.env.POSTHOG_PERSONAL_KEY || undefined,
      featureFlagsPollingInterval: 30000,
    })
  : null;

async function isEnabled(flag, log) {
  const v = ph ? !!(await ph.isFeatureEnabled(flag, 'campus-events-api')) : false;
  if (log) log.info({ flag, enabled: v }, 'feature flag evaluated');
  return v;
}

module.exports = { isEnabled };
