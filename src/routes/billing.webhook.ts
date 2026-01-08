import type { Request, Response } from 'express'
import { BillingService } from '../services/billing.service'

export async function billingWebhookHandler(req: Request, res: Response) {
  try {
    const signature = req.headers['stripe-signature']
    if (!signature || typeof signature !== 'string') {
      return res.status(400).send('Missing Stripe signature')
    }

    const rawBody = req.body as Buffer
    if (!rawBody || !(rawBody instanceof Buffer)) {
      return res.status(400).send('Invalid body')
    }

    await BillingService.handleStripeWebhook(rawBody, signature)
    return res.status(200).json({ received: true })
  } catch (error: any) {
    // Stripe expects 2xx for success; non-2xx triggers retries.
    const message = error?.message || 'Webhook error'
    return res.status(400).send(message)
  }
}
