import Joi from 'joi'
import { alnumText, boundedDateString, optionalAlnumText } from './common'

const TEST_REF_CATEGORIES = [
  'TEST_REQUISICAO',
  'TEST_RESPOSTA',
  'TEST_AMOSTRA',
  'TEST_EVIDENCIAS',
  'TESTE_REQUISICAO',
  'TESTE_RESPOSTA',
  'TESTE_AMOSTRA',
  'TESTE_EVIDENCIAS',
] as const

const ALL_ATTACHMENT_CATEGORIES = [
  'NORMA',
  'TEMPLATE',
  'RESPOSTA',
  'DEFICIENCIA',
  ...TEST_REF_CATEGORIES,
] as const

export const createPldSectionSchema = Joi.object({
  item: alnumText(100).required(),
  customLabel: optionalAlnumText(100),
  hasNorma: Joi.boolean().optional(),
  normaReferencia: optionalAlnumText(600),
  descricao: optionalAlnumText(600),
})

export const updatePldSectionSchema = Joi.object({
  item: alnumText(100).optional(),
  customLabel: optionalAlnumText(100),
  hasNorma: Joi.boolean().optional(),
  normaReferencia: optionalAlnumText(600),
  descricao: optionalAlnumText(600),
}).min(1)

export const createPldQuestionSchema = Joi.object({
  sectionId: Joi.string().trim().required(),
  texto: alnumText(300).allow('').required(),
})

export const updatePldQuestionSchema = Joi.object({
  sectionId: Joi.string().trim().optional(),
  texto: optionalAlnumText(300),
  aplicavel: Joi.boolean().optional(),
  respondida: Joi.boolean().optional(),
  templateRef: optionalAlnumText(300),
  capitulacao: optionalAlnumText(200),
  criticidade: Joi.string().valid('BAIXA', 'MEDIA', 'ALTA').optional(),
  resposta: Joi.string().valid('Sim', 'Não', '').allow(null).optional(),
  respostaTexto: optionalAlnumText(500),
  deficienciaTexto: optionalAlnumText(500),
  recomendacaoTexto: optionalAlnumText(300),
  testStatus: Joi.string().valid('SIM', 'NAO', 'NAO_PLANO', '').allow(null).optional(),
  testDescription: optionalAlnumText(600),
  requisicaoRef: optionalAlnumText(300),
  respostaTesteRef: optionalAlnumText(300),
  amostraRef: optionalAlnumText(300),
  evidenciasRef: optionalAlnumText(300),
  actionOrigem: optionalAlnumText(300),
  actionResponsavel: optionalAlnumText(300),
  actionDescricao: optionalAlnumText(600),
  actionDataApontamento: boundedDateString(),
  actionPrazoOriginal: boundedDateString(),
  actionPrazoAtual: boundedDateString(),
  actionComentarios: optionalAlnumText(600),
}).min(1)

export const uploadPldAttachmentSchema = Joi.object({
  category: Joi.string()
    .valid(...ALL_ATTACHMENT_CATEGORIES)
    .required(),
  referenceText: Joi.alternatives()
    .conditional('category', {
      is: Joi.string().valid(...TEST_REF_CATEGORIES),
      then: optionalAlnumText(300),
      otherwise: optionalAlnumText(600),
    })
    .optional(),
})

export const uploadPldNormaSchema = Joi.object({
  referencia: optionalAlnumText(600),
})
