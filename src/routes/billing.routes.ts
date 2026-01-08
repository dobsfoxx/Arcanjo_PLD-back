import express from 'express'
import { authenticate } from '../middleware/auth'
import { BillingService } from '../services/billing.service'

const router = express.Router()

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = req.user!
    const entitlements = BillingService.getEntitlements(user)
    res.json({ entitlements })
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erro ao consultar status de assinatura' })
  }
})

// Cria uma sessão de checkout no Stripe.
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const result = await BillingService.createCheckoutSession(req.user!.id)
    res.json(result)
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Checkout não configurado' })
  }
})

// Portal do cliente (gerenciar assinatura)
router.post('/portal', authenticate, async (req, res) => {
  try {
    const result = await BillingService.createPortalSession(req.user!.id)
    res.json(result)
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Portal não configurado' })
  }
})

export default router
