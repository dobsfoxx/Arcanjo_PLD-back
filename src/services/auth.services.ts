import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../config/database'

export class AuthService {
  // Hash de senha
  static async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10)
  }

  // Comparar senha
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash)
  }

  // Gerar token JWT
  static generateToken(userId: string): string {
    return jwt.sign(
      { id: userId },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )
  }

  // Registrar usuário
  static async register(email: string, password: string, name: string) {
    // Verificar se email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      throw new Error('Email já cadastrado')
    }

    // Hash da senha
    const hashedPassword = await this.hashPassword(password)

    // Calcular trial (7 dias)
    const trialExpiresAt = new Date()
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 7)

    // Criar usuário
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        isTrial: true,
        trialExpiresAt
      }
    })

    // Gerar token
    const token = this.generateToken(user.id)

    // Retornar sem a senha
    const { password: _, ...userWithoutPassword } = user

    return { user: userWithoutPassword, token }
  }

  // Login
  static async login(email: string, password: string) {
    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      throw new Error('Credenciais inválidas')
    }

    // Verificar senha
    const validPassword = await this.comparePassword(password, user.password)
    if (!validPassword) {
      throw new Error('Credenciais inválidas')
    }

    // Verificar se usuário está ativo
    if (!user.isActive) {
      throw new Error('Conta desativada')
    }

    // Gerar token
    const token = this.generateToken(user.id)

    // Retornar sem a senha
    const { password: _, ...userWithoutPassword } = user

    return { user: userWithoutPassword, token }
  }

  // Validar token
  static async validateToken(token: string) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string }
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.id }
      })

      return user
    } catch (error) {
      return null
    }
  }
}