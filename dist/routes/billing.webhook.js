"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.billingWebhookHandler = billingWebhookHandler;
const billing_service_1 = require("../services/billing.service");
async function billingWebhookHandler(req, res) {
    try {
        const signature = req.headers['stripe-signature'];
        if (!signature || typeof signature !== 'string') {
            return res.status(400).send('Missing Stripe signature');
        }
        const rawBody = req.body;
        if (!rawBody || !(rawBody instanceof Buffer)) {
            return res.status(400).send('Invalid body');
        }
        await billing_service_1.BillingService.handleStripeWebhook(rawBody, signature);
        return res.status(200).json({ received: true });
    }
    catch (error) {
        // Stripe expects 2xx for success; non-2xx triggers retries.
        const message = error?.message || 'Webhook error';
        return res.status(400).send(message);
    }
}
