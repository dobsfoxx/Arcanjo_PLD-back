// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Resend } = require('resend') as any

interface SendMailOptions {
  to: string
  subject: string
  html: string
}

export class EmailService {
  private static getResendClient() {
    const apiKey = (process.env.RESEND_API_KEY || '').trim()
    if (!apiKey) return null
    return new Resend(apiKey)
  }

  static async sendMail(options: SendMailOptions) {
    const normalizedFrom = (process.env.MAIL_FROM || '').trim()
    const from = normalizedFrom || options.to

    const resend = this.getResendClient()
    if (resend) {
      try {
        await resend.emails.send({
          from,
          to: options.to,
          subject: options.subject,
          html: options.html,
        })
        console.log('📧 E-mail enviado com sucesso via Resend')
        return
      } catch (error: any) {
        console.error('❌ Erro ao enviar e-mail via Resend:', error?.message || error)
        throw new Error(`Erro ao enviar e-mail: ${error?.message || 'verifique configuração Resend'}`)
      }
    }

    throw new Error('Erro ao enviar e-mail: RESEND_API_KEY não configurada')
  }
}
