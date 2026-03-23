import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import StatusBadge from '@/components/status-badge';

const mockFetch = (ok: boolean) =>
  vi.fn().mockResolvedValue({ ok } as Response);

afterEach(() => vi.restoreAllMocks());

describe('StatusBadge', () => {
  it('shows Operational when fetch returns 200', async () => {
    global.fetch = mockFetch(true);
    await act(async () => { render(<StatusBadge />); });
    expect(screen.getByText('Operational')).toBeInTheDocument();
  });

  it('shows Degraded when fetch returns non-200', async () => {
    global.fetch = mockFetch(false);
    await act(async () => { render(<StatusBadge />); });
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('shows Degraded when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'));
    await act(async () => { render(<StatusBadge />); });
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('sets up auto-refresh interval', async () => {
    vi.useFakeTimers();
    global.fetch = mockFetch(true);
    await act(async () => { render(<StatusBadge />); });
    const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
    vi.useRealTimers();
  });
});
