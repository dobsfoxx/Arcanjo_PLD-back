"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const billing_service_1 = require("../services/billing.service");
const router = express_1.default.Router();
router.get('/me', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const entitlements = billing_service_1.BillingService.getEntitlements(user);
        res.json({ entitlements });
    }
    catch (error) {
        res.status(400).json({ error: error.message || 'Erro ao consultar status de assinatura' });
    }
});
// Cria uma sessão de checkout no Stripe.
router.post('/checkout', auth_1.authenticate, async (req, res) => {
    try {
        const result = await billing_service_1.BillingService.createCheckoutSession(req.user.id);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: error.message || 'Checkout não configurado' });
    }
});
// Portal do cliente (gerenciar assinatura)
router.post('/portal', auth_1.authenticate, async (req, res) => {
    try {
        const result = await billing_service_1.BillingService.createPortalSession(req.user.id);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: error.message || 'Portal não configurado' });
    }
});
exports.default = router;
