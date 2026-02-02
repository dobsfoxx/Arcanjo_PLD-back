import type { RequestHandler } from 'express'
import type { Schema } from 'joi'

export const validateBody = (schema: Schema): RequestHandler => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    })

    if (error) {
      const details = error.details.map((d) => ({
        message: d.message,
        path: d.path.join('.'),
        type: d.type,
      }))
      const message = details.map((d) => d.message).join('; ')
      return res.status(400).json({ error: message, details })
    }

    req.body = value
    return next()
  }
}
