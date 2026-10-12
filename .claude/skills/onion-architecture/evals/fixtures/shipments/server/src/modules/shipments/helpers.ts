import { CARRIER_BASE_URL } from '../../adapters/carrier/index.js';
import type { ShipmentRecord } from './types.js';

export function trackingUrl(s: ShipmentRecord): string {
  return CARRIER_BASE_URL + '/public/' + s.trackingNumber;
}

export function toShipmentDto(s: ShipmentRecord) {
  return {
    id: s.id,
    carrier: s.carrier,
    tracking_number: s.trackingNumber,
    status: s.status,
    tracking_url: trackingUrl(s),
    updated_at: s.updatedAt.toISOString(),
  };
}

export function latestStatus(events: Array<{ code: string; at: Date }>): string | undefined {
  return [...events].sort((a, b) => b.at.getTime() - a.at.getTime())[0]?.code;
}
