import bcrypt from 'bcryptjs'
import prisma from '../config/database'
import { signToken } from '../middleware/auth'
import crypto from 'crypto'
// Import direto; a declaração de tipos está em src/types/nodemailer.d.ts
// Import com require para evitar problemas de resolução de tipos em tempo de compilação
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const { EmailService } = require('./email.service') as any

const parsedRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10)
const SALT_ROUNDS = Number.isFinite(parsedRounds) && parsedRounds >= 10 ? parsedRounds : 12

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/

function assertStrongPassword(password: string, minLen = 8) {
  const withinMin = password.length >= minLen
  if (!withinMin || !PASSWORD_REGEX.test(password)) {
    throw new Error(
      minLen >= 12
        ? 'Senha do administrador deve ter pelo menos 12 caracteres e conter letra maiúscula, minúscula, número e símbolo'
        : 'A senha deve ter pelo menos 8 caracteres e conter letra maiúscula, minúscula, número e símbolo'
    )
  }
}

interface GoogleUserProfile {
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

export class AuthService {
  /**
   * Autentica/registra usuário via Google OAuth.
   * Se o usuário já existe (pelo email), faz login.
   * Se não existe, cria uma nova conta.
   */
  static async loginWithGoogleProfile(profile: GoogleUserProfile) {
    const { email, name, picture } = profile;

    if (!email) {
      throw new Error('E-mail não fornecido pelo Google');
    }

    // Verifica se usuário já existe
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // Usuário existente - verificar se está ativo
      if (!user.isActive) {
        throw new Error('Usuário inativo');
      }
    } else {
      // Novo usuário - criar conta
      // Gera uma senha aleatória (não será usada para login via Google)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, SALT_ROUNDS);

      user = await prisma.user.create({
        data: {
          name: name || email.split('@')[0],
          email,
          password: hashedPassword,
          role: 'USER',
          isTrial: false,
          trialExpiresAt: null,
        },
      });
    }

    const token = signToken(user.id);

    return { user, token };
  }

  static async registerUser(
    name: string,
    email: string,
    password: string,
    opts?: { startTrial?: boolean }
  ) {
    const existing = await prisma.user.findUnique({ where: { email } })

    if (existing) {
      throw new Error('E-mail já está em uso')
    }

    assertStrongPassword(password, 8)

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

    const startTrial = !!opts?.startTrial
    const trialExpiresAt = startTrial ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) : null

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: startTrial ? 'TRIAL_ADMIN' : 'USER',
        isTrial: startTrial,
        trialExpiresAt,
      },
    })

    const token = signToken(user.id)

    return { user, token }
  }

  static async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      throw new Error('Credenciais inválidas')
    }

    const isValid = await bcrypt.compare(password, user.password)

    if (!isValid) {
      throw new Error('Credenciais inválidas')
    }

    if (!user.isActive) {
      throw new Error('Usuário inativo')
    }

    // Se o trial expirou, rebaixa imediatamente para USER.
    if (user.role === 'TRIAL_ADMIN' && user.isTrial && user.trialExpiresAt && user.trialExpiresAt.getTime() <= Date.now()) {
      const downgraded = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'USER', isTrial: false, trialExpiresAt: null },
      })
      const token = signToken(downgraded.id)
      return { user: downgraded, token }
    }

    const token = signToken(user.id)

    return { user, token }
  }

  /**
   * Cria o primeiro administrador do sistema se ainda não existir nenhum.
   * Para segurança, esta rota deve ser usada apenas na fase de implantação.
   */
  static async bootstrapAdmin(name: string, email: string, password: string) {
    const anyAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })

    if (anyAdmin) {
      throw new Error('Já existe um administrador cadastrado')
    }

    assertStrongPassword(password, 12)

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'ADMIN',
        isTrial: false,
      },
    })

    const token = signToken(user.id)

    return { user, token }
  }

  // Solicitar recuperação de senha: gera token e envia e-mail
  static async requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({ where: { email } })

    // Por segurança, não revelar se o usuário existe ou não
    if (!user || !user.isActive) {
      return
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    try {
      await (prisma as any).passwordResetToken.create({
        data: {
          token: rawToken,
          userId: user.id,
          expiresAt,
        },
      })
    } catch (error: any) {
      const code = error?.code || error?.meta?.code
      console.error('[AUTH] failed to create reset token:', {
        code,
        message: error?.message || error,
      })
      const wrapped = new Error('Password reset token store unavailable')
      ;(wrapped as any).code = 'PASSWORD_RESET_STORE_UNAVAILABLE'
      throw wrapped
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`

    try {
      await EmailService.sendMail({
        to: user.email,
        subject: 'Recuperação de senha - Sistema Arcanjo PLD',
        html: `
          <p>Olá, ${user.name}</p>
          <p>Recebemos uma solicitação de redefinição de senha para sua conta.</p>
          <p>Clique no link abaixo para criar uma nova senha (válido por 1 hora):</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>Se você não solicitou esta alteração, ignore este e-mail.</p>
        `,
      })
    } catch (error: unknown) {
      console.error('[AUTH] failed to send reset email:', error)
      // Não propagar erro para evitar revelar detalhes de configuração SMTP.
    }
  }

  // Redefinir senha a partir de um token válido
  static async resetPassword(token: string, newPassword: string) {
    assertStrongPassword(newPassword, 8)

    const resetToken = await (prisma as any).passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new Error('Token de recuperação inválido ou expirado')
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          password: hashedPassword,
        },
      }),
      (prisma as any).passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ])
  }
}
