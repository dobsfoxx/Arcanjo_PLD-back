import Joi from 'joi'
import { alnumText, optionalAlnumText } from './common'

export const createTopicSchema = Joi.object({
  name: alnumText(300).required(),
  description: optionalAlnumText(600),
  internalNorm: optionalAlnumText(300),
})

export const createFormQuestionSchema = Joi.object({
  topicId: Joi.string().trim().required(),
  title: alnumText(300).required(),
  description: optionalAlnumText(600),
  criticality: Joi.string().trim().optional(),
  capitulation: optionalAlnumText(200),
})

export const updateFormQuestionSchema = Joi.object({
  title: alnumText(300).optional(),
  description: optionalAlnumText(600),
  criticality: Joi.string().trim().optional(),
  capitulation: optionalAlnumText(200),
}).min(1)

export const answerQuestionSchema = Joi.object({
  questionId: Joi.string().trim().required(),
  response: Joi.boolean().required(),
  justification: optionalAlnumText(500),
  testOption: Joi.string().trim().allow(null, '').optional(),
  testDescription: optionalAlnumText(600),
  correctiveActionPlan: optionalAlnumText(200),
})

export const adminUpdateAnswerSchema = Joi.object({
  questionId: Joi.string().trim().required(),
  assigneeId: Joi.string().trim().required(),
  response: Joi.boolean().required(),
  justification: optionalAlnumText(500),
  deficiency: optionalAlnumText(500),
  recommendation: optionalAlnumText(300),
  testOption: Joi.string().trim().allow(null, '').optional(),
  testDescription: optionalAlnumText(600),
  correctiveActionPlan: optionalAlnumText(200),
}).custom((value, helpers) => {
  if (value.response === false) {
    if (!value.deficiency || !String(value.deficiency).trim()) {
      return helpers.error('any.custom', { message: 'Para resposta "Não", deficiência é obrigatória' })
    }
    if (!value.recommendation || !String(value.recommendation).trim()) {
      return helpers.error('any.custom', { message: 'Para resposta "Não", recomendação é obrigatória' })
    }
  }
  return value
})
