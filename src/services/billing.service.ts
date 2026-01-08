import type { User } from '@prisma/client'
import prisma from '../config/database'
import Stripe from 'stripe'

type EntitlementsUser = Pick<User, 'role' | 'isTrial' | 'trialExpiresAt' | 'subscriptionStatus' | 'subscriptionExpiresAt'>

type Entitlements = {
  hasBuilderAccess: boolean
  maxBuilderSections: number | null
  maxBuilderQuestions: number | null
  trialExpiresAt: Date | null
  subscriptionStatus: string
}

function isTrialActive(user: EntitlementsUser) {
  if (!user.isTrial) return false
  if (!user.trialExpiresAt) return false
  return user.trialExpiresAt.getTime() > Date.now()
}

function hasActiveSubscription(user: EntitlementsUser) {
  if ((user.subscriptionStatus || '').toUpperCase() !== 'ACTIVE') return false
  if (!user.subscriptionExpiresAt) return true
  return new Date(user.subscriptionExpiresAt).getTime() > Date.now()
}

export class BillingService {
  private static getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY não configurado')
    }
    // O SDK tipa a apiVersion com um literal específico; mantenha alinhado ao pacote.
    return new Stripe(key, { apiVersion: '2025-12-15.clover' })
  }

  static getEntitlements(user: EntitlementsUser): Entitlements {
    const subscriptionStatus = user.subscriptionStatus || 'NONE'

    if (user.role === 'ADMIN') {
      return {
        hasBuilderAccess: true,
        maxBuilderSections: null,
        maxBuilderQuestions: null,
        trialExpiresAt: user.trialExpiresAt ?? null,
        subscriptionStatus,
      }
    }

    if (user.role === 'TRIAL_ADMIN') {
      const active = isTrialActive(user)
      return {
        hasBuilderAccess: active,
        maxBuilderSections: active ? 3 : 0,
        maxBuilderQuestions: active ? 3 : 0,
        trialExpiresAt: user.trialExpiresAt ?? null,
        subscriptionStatus,
      }
    }

    if (hasActiveSubscription(user)) {
      return {
        hasBuilderAccess: true,
        maxBuilderSections: null,
        maxBuilderQuestions: null,
        trialExpiresAt: user.trialExpiresAt ?? null,
        subscriptionStatus,
      }
    }

    return {
      hasBuilderAccess: false,
      maxBuilderSections: 0,
      maxBuilderQuestions: 0,
      trialExpiresAt: user.trialExpiresAt ?? null,
      subscriptionStatus,
    }
  }

  static async ensureStripeCustomer(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('Usuário não encontrado')

    const existing = (user as any).stripeCustomerId as string | null
    if (existing) return { stripeCustomerId: existing }

    const stripe = this.getStripe()
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId: user.id },
    })

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id } as any,
    })

    return { stripeCustomerId: (updated as any).stripeCustomerId as string }
  }

  static async createCheckoutSession(_userId: string) {
    const priceId = process.env.STRIPE_PRICE_ID
    if (!priceId) throw new Error('STRIPE_PRICE_ID não configurado')

    const stripe = this.getStripe()
    const { stripeCustomerId } = await this.ensureStripeCustomer(_userId)

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId || undefined,
      client_reference_id: _userId,
      metadata: { userId: _userId },
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${frontendUrl}/payment?success=1`,
      cancel_url: `${frontendUrl}/payment?canceled=1`,
    })

    return { url: session.url }
  }

  static async createPortalSession(userId: string) {
    const stripe = this.getStripe()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('Usuário não encontrado')
    const customerId = (user as any).stripeCustomerId as string | null
    if (!customerId) throw new Error('Cliente Stripe não encontrado')

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontendUrl}/payment`,
    })

    return { url: portal.url }
  }

  static async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET não configurado')

    const stripe = this.getStripe()
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = (session.metadata?.userId || session.client_reference_id || '') as string
      if (!userId) return

      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : (session.subscription as any)?.id

      let expiresAt: Date | null = null
      if (subscriptionId) {
        const sub: any = await stripe.subscriptions.retrieve(subscriptionId)
        const end = sub?.current_period_end
        expiresAt = typeof end === 'number' ? new Date(end * 1000) : null
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          stripeCustomerId: customerId || undefined,
          stripeSubscriptionId: subscriptionId || undefined,
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: expiresAt,
        } as any,
      })
      return
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub: any = event.data.object as Stripe.Subscription
      const subscriptionId = sub.id
      const status = (sub.status || 'unknown').toUpperCase()
      const expiresAt = typeof sub.current_period_end === 'number' ? new Date(sub.current_period_end * 1000) : null

      const normalizedStatus = status === 'ACTIVE' || status === 'TRIALING' ? 'ACTIVE' : status

      await prisma.user.updateMany({
        where: { stripeSubscriptionId: subscriptionId } as any,
        data: {
          subscriptionStatus: normalizedStatus,
          subscriptionExpiresAt: normalizedStatus === 'ACTIVE' ? expiresAt : expiresAt,
        } as any,
      })
      return
    }
  }
}
