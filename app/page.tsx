import LandingWrapper from './landing-wrapper';
import ClassicLanding from './classic-landing';

/**
 * Main landing page that conditionally renders casual or classic version
 * based on feature flag: ui_casual_landing
 */
export default function Page() {
  return <LandingWrapper ClassicLanding={ClassicLanding} />;
}
