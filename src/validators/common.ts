import Joi from 'joi'

const ALNUM_PT = /^[\p{L}\p{N}\s.,;:()!?"'ºª\-_/\\]*$/u

const currentYear = () => new Date().getFullYear()
const minAllowedYear = () => {
  const raw = (process.env.MIN_ALLOWED_YEAR ?? '2000').trim()
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : 2000
}

export const alnumText = (max: number) =>
  Joi.string()
    .trim()
    .max(max)
    .pattern(ALNUM_PT)
    .messages({
      'string.max': `Deve ter no máximo ${max} caracteres`,
      'string.pattern.base': 'Deve conter apenas caracteres alfanuméricos (com espaços) e pontuação simples',
    })

export const optionalAlnumText = (max: number) => alnumText(max).allow(null, '')

export const boundedDateString = () =>
  Joi.string()
    .trim()
    .allow(null, '')
    .custom((value, helpers) => {
      if (value === null) return null
      if (typeof value !== 'string') return helpers.error('date.base')
      const trimmed = value.trim()
      if (!trimmed) return null

      const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed
      const parsed = new Date(isoLike)
      if (Number.isNaN(parsed.getTime())) return helpers.error('date.format')

      const year = parsed.getUTCFullYear()
      const minYear = minAllowedYear()
      const maxYear = currentYear()

      if (year < minYear) return helpers.error('date.minYear', { minYear })
      if (year > maxYear) return helpers.error('date.maxYear', { maxYear })

      return trimmed
    })
    .messages({
      'date.base': 'Data inválida',
      'date.format': 'Data inválida',
      'date.minYear': 'Ano muito antigo (mínimo {{#minYear}})',
      'date.maxYear': 'Ano não pode ser maior que {{#maxYear}}',
    })
