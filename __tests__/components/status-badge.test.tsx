import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StatusBadge } from '@/components/status-badge';

describe('StatusBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    render(<StatusBadge />);
    await act(async () => { await Promise.resolve(); });
  });

  it('shows Operational when fetch returns 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    render(<StatusBadge />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Operational')).toBeTruthy();
  });

  it('shows Degraded when fetch returns non-200', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    render(<StatusBadge />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Degraded')).toBeTruthy();
  });

  it('shows Degraded when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    render(<StatusBadge />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Degraded')).toBeTruthy();
  });

  it('auto-refreshes every 60 seconds', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    render(<StatusBadge />);
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });
});
