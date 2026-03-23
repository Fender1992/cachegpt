'use client';

import { useEffect, useState } from 'react';

type Status = 'loading' | 'operational' | 'degraded';

export default function StatusBadge() {
  const [status, setStatus] = useState<Status>('loading');

  const check = async () => {
    try {
      const res = await fetch('/api/health');
      setStatus(res.ok ? 'operational' : 'degraded');
    } catch {
      setStatus('degraded');
    }
  };

  useEffect(() => {
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (status === 'loading') return null;

  const operational = status === 'operational';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
      <span
        className={`w-2 h-2 rounded-full ${operational ? 'bg-green-500' : 'bg-red-500'}`}
      />
      {operational ? 'Operational' : 'Degraded'}
    </span>
  );
}
