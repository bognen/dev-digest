import type { CarrierCode } from '@devdigest/shared';

export interface ShipmentRecord {
  id: string;
  workspaceId: string;
  carrier: CarrierCode;
  trackingNumber: string;
  status: string;
  updatedAt: Date;
}

export interface ShipmentsRepo {
  getById(workspaceId: string, id: string): Promise<ShipmentRecord | undefined>;
  setStatus(workspaceId: string, id: string, status: string): Promise<void>;
}
