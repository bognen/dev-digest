import { and, eq, desc } from 'drizzle-orm';
import type { CarrierCode } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { NotFoundError, ExternalServiceError } from '../../platform/errors.js';
import type { CarrierClient } from '../../vendor/shared/adapters.js';
import { ShipmentsRepository } from './repository.js';
import { latestStatus } from './helpers.js';
import type { ShipmentRecord } from './types.js';

export interface ShipmentsServiceDeps {
  repo: ShipmentsRepository;
  db: Db;
  carrier: () => Promise<CarrierClient>;
}

export class ShipmentsService {
  constructor(private deps: ShipmentsServiceDeps) {}

  async get(workspaceId: string, id: string): Promise<ShipmentRecord> {
    const shipment = await this.deps.repo.getById(workspaceId, id);
    if (!shipment) throw new NotFoundError('Shipment not found');
    return shipment;
  }

  async listByCarrier(workspaceId: string, carrier: CarrierCode) {
    return this.deps.db
      .select()
      .from(t.shipments)
      .where(and(eq(t.shipments.workspaceId, workspaceId), eq(t.shipments.carrier, carrier)))
      .orderBy(desc(t.shipments.updatedAt));
  }

  async refresh(workspaceId: string, id: string): Promise<ShipmentRecord> {
    const shipment = await this.get(workspaceId, id);
    const carrier = await this.deps.carrier();
    const events = await carrier.track(shipment.trackingNumber).catch(() => {
      throw new ExternalServiceError('Carrier lookup failed');
    });
    const status = latestStatus(events);
    if (status && status !== shipment.status) {
      await this.deps.repo.setStatus(workspaceId, id, status);
    }
    return this.get(workspaceId, id);
  }
}
