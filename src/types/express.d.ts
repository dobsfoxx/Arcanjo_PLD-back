import type { User } from '@prisma/client'

type RequestUser = Omit<User, 'password'> & { password?: string }

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser
    }
  }
}

export {}