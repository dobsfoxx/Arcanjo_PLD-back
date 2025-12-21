// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require('nodemailer') as typeof import('nodemailer')

interface SendMailOptions {
  to: string
  subject: string
  html: string
}

export class EmailService {
  private static async getTransporter() {
    // Normaliza valores do .env (remove espaços extras e aspas ao redor)
    const normalize = (value?: string) =>
      value ? value.trim().replace(/^['"]|['"]$/g, '') : ''

    const host = normalize(process.env.SMTP_HOST)
    const portEnv = normalize(process.env.SMTP_PORT)
    const port = portEnv ? Number(portEnv) : 587
    const user = normalize(process.env.SMTP_USER)
    const pass = normalize(process.env.SMTP_PASS)

    if (!host || !user || !pass) {
      throw new Error('Configuração SMTP ausente. Defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS.')
    }

    console.log('📧 Config SMTP em uso:', { host, port, user })

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })

    return transporter
  }

  static async sendMail(options: SendMailOptions) {
    const from = process.env.MAIL_FROM || options.to

    const transporter = await this.getTransporter()

    try {
      const info = await transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      })

      // info é do tipo unknown pelos tipos mínimos de nodemailer;
      // fazemos cast para any apenas para fins de log.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const loggedInfo: any = info
      console.log('📧 E-mail enviado com sucesso:', loggedInfo.messageId || loggedInfo)
    } catch (error: any) {
      console.error('❌ Erro ao enviar e-mail:', error?.message || error)
      throw new Error(`Erro ao enviar e-mail: ${error?.message || 'verifique configuração SMTP'}`)
    }
  }
}
