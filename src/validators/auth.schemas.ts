import Joi from 'joi'

const strongPassword = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
  .messages({
    'string.min': 'A senha deve ter pelo menos 8 caracteres',
    'string.max': 'A senha deve ter no máximo 128 caracteres',
    'string.pattern.base': 'A senha deve conter letra maiúscula, minúscula, número e símbolo',
  })

export const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).required(),
  password: strongPassword.required(),
  startTrial: Joi.boolean().optional(),
})

export const loginSchema = Joi.object({
  email: Joi.string().trim().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(1).max(128).required(),
})

export const bootstrapAdminSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).required(),
  password: strongPassword.min(12).required().messages({
    'string.min': 'Senha do administrador deve ter pelo menos 12 caracteres',
  }),
})

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().email({ tlds: { allow: false } }).required(),
})

export const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().min(20).max(200).required(),
  password: strongPassword.required(),
})

export const googleSchema = Joi.object({
  credential: Joi.string().trim().min(10).required(),
})
