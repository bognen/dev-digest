import { WebClient } from '@slack/web-api';
import type { Notifier } from '../../vendor/shared/adapters.js';
import { NOTE_URL_PREFIX } from '../../modules/notes/constants.js';

export class SlackNotifier implements Notifier {
  private client: WebClient;

  constructor(token: string, private channel: string) {
    this.client = new WebClient(token);
  }

  async announce(title: string, noteId: string): Promise<void> {
    await this.client.chat.postMessage({
      channel: this.channel,
      text: `New note: ${title} ${NOTE_URL_PREFIX}${noteId}`,
    });
  }
}
