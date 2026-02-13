/**
 * Panel Manager
 * Coordinates panel open/close so only one panel is open at a time.
 * Also manages quick-reply notifications from integrations.
 */

type PanelId = 'discord' | 'gmail' | 'calendar' | 'slack' | 'notion' | 'drive' | 'jira' | 'files';
type CloseCallback = () => void;

class PanelManager {
  private closers = new Map<PanelId, CloseCallback>();

  /**
   * Register a panel's close function
   */
  register(id: PanelId, closeFn: CloseCallback): void {
    this.closers.set(id, closeFn);
  }

  /**
   * Called when a panel opens — closes all other panels
   */
  onOpen(id: PanelId): void {
    for (const [panelId, closeFn] of this.closers) {
      if (panelId !== id) {
        closeFn();
      }
    }
  }
}

export const panelManager = new PanelManager();
