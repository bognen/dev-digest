import type { WarehouseClient } from '../../vendor/shared/adapters.js';
import { ExternalServiceError } from '../../platform/errors.js';

export class HttpWarehouse implements WarehouseClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  async reserve(sku: string, qty: number): Promise<{ reservationId: string }> {
    const res = await fetch(this.baseUrl + '/reservations', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + this.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ sku, qty }),
    });
    if (!res.ok) throw new ExternalServiceError('Warehouse responded ' + res.status);
    const body = (await res.json()) as { id: string };
    return { reservationId: body.id };
  }

  async release(reservationId: string): Promise<void> {
    const res = await fetch(this.baseUrl + '/reservations/' + reservationId, {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + this.apiKey },
    });
    if (!res.ok) throw new ExternalServiceError('Warehouse responded ' + res.status);
  }
}
