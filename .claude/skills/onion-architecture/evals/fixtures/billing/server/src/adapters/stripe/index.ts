import Stripe from 'stripe';
import type { PaymentGateway } from '../../modules/billing/types.js';
import type { ChargeRequest } from '../../modules/billing/types.js';
import { ExternalServiceError } from '../../platform/errors.js';

export class StripeGateway implements PaymentGateway {
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async charge(req: ChargeRequest): Promise<{ externalRef: string }> {
    const intent = await this.stripe.paymentIntents.create({
      amount: req.amountCents,
      currency: 'usd',
      metadata: { invoiceId: req.invoiceId },
    });
    if (!intent.id) throw new ExternalServiceError('Stripe returned no id');
    return { externalRef: intent.id };
  }
}
