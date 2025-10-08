'use client';

import { useEffect, useState } from 'react';
import Hero from './Hero';
import TrustBar from './TrustBar';
import FeatureCards from './FeatureCards';
import Callouts from './Callouts';
import Footer from './Footer';

interface CasualLandingProps {
  variant?: 'A' | 'B';
}

export default function CasualLanding({ variant = 'A' }: CasualLandingProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className={`min-h-screen transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <Hero variant={variant} />
      <TrustBar />
      <FeatureCards />
      <Callouts />
      <Footer />
    </div>
  );
}
