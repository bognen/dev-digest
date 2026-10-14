import type { Notifier } from '../../vendor/shared/adapters.js';

export class MockNotifier implements Notifier {
  sent: Array<{ title: string; noteId: string }> = [];

  async announce(title: string, noteId: string): Promise<void> {
    this.sent.push({ title, noteId });
  }
}
