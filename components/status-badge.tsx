'use client';

import { useEffect, useState } from 'react';

type Status = 'operational' | 'degraded' | 'loading';

export function StatusBadge() {
  const [status, setStatus] = useState<Status>('loading');

  async function check() {
    try {
      const res = await fetch('/api/health-check');
      setStatus(res.ok ? 'operational' : 'degraded');
    } catch {
      setStatus('degraded');
    }
  }

  useEffect(() => {
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (status === 'loading') return null;

  const ok = status === 'operational';
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'Operational' : 'Degraded'}
    </div>
  );
}
