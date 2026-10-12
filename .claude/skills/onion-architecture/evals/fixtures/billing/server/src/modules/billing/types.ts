import type { PaymentMethod } from '@devdigest/shared';

export interface ChargeRequest {
  invoiceId: string;
  amountCents: number;
  method: PaymentMethod;
}

export interface ChargeRecord {
  id: string;
  workspaceId: string;
  invoiceId: string;
  amountCents: number;
  method: PaymentMethod;
  externalRef: string | null;
  createdAt: Date;
}

export interface PaymentGateway {
  charge(req: ChargeRequest): Promise<{ externalRef: string }>;
}
