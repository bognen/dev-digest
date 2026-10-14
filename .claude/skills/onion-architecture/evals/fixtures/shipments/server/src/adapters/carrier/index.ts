import type { CarrierClient, TrackingEvent } from '../../vendor/shared/adapters.js';
import { ExternalServiceError } from '../../platform/errors.js';

export const CARRIER_BASE_URL = 'https://api.carrier.example.com/v2';

export class HttpCarrierClient implements CarrierClient {
  constructor(private apiKey: string) {}

  async track(trackingNumber: string): Promise<TrackingEvent[]> {
    const res = await fetch(CARRIER_BASE_URL + '/track/' + trackingNumber, {
      headers: { authorization: 'Bearer ' + this.apiKey },
    });
    if (!res.ok) throw new ExternalServiceError('Carrier responded ' + res.status);
    const body = (await res.json()) as { events: Array<{ code: string; at: string }> };
    return body.events.map((e) => ({ code: e.code, at: new Date(e.at) }));
  }
}
