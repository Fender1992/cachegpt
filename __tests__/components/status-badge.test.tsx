import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import StatusBadge from '@/components/status-badge';

const mockFetch = vi.mocked(global.fetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StatusBadge', () => {
  it('renders nothing initially before fetch resolves', () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    const { container } = render(<StatusBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Operational when fetch returns 200', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    render(<StatusBadge />);
    await waitFor(() => expect(screen.getByText('Operational')).toBeInTheDocument());
  });

  it('shows Degraded when fetch returns non-200', async () => {
    mockFetch.mockResolvedValue({ ok: false } as Response);
    render(<StatusBadge />);
    await waitFor(() => expect(screen.getByText('Degraded')).toBeInTheDocument());
  });

  it('shows Degraded when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    render(<StatusBadge />);
    await waitFor(() => expect(screen.getByText('Degraded')).toBeInTheDocument());
  });

  it('sets up auto-refresh interval of 60s', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true } as Response);
    render(<StatusBadge />);
    await act(async () => { await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
