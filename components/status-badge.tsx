'use client';

import { useEffect, useState } from 'react';

export default function StatusBadge() {
  const [operational, setOperational] = useState<boolean | null>(null);

  const check = async () => {
    try {
      const res = await fetch('/api/health');
      setOperational(res.ok);
    } catch {
      setOperational(false);
    }
  };

  useEffect(() => {
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (operational === null) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
      <span
        className={`w-2 h-2 rounded-full ${operational ? 'bg-green-500' : 'bg-red-500'}`}
      />
      {operational ? 'Operational' : 'Degraded'}
    </span>
  );
}
