import express from 'express'
import { authenticate, requireAdmin, requireBuilderAccess } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import { upload } from '../config/upload'
import { PldBuilderService, ATTACHMENT_CATEGORIES, type AttachmentCategory } from '../services/pldBuilder.service'
import { toPublicErrorMessage } from '../utils/publicError'
import {
  createPldQuestionSchema,
  createPldSectionSchema,
  updatePldQuestionSchema,
  updatePldSectionSchema,
  uploadPldAttachmentSchema,
  uploadPldNormaSchema,
} from '../validators/pldBuilder.schemas'

const router = express.Router()

// Listar seções com perguntas/arquivos
router.get('/sections', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const data = await PldBuilderService.listSections(req.user!)
    res.json({ sections: data })
  } catch (error: any) {
    res.status(500).json({ error: toPublicErrorMessage(error, 'Erro ao carregar seções') })
  }
})

router.post('/sections', authenticate, requireBuilderAccess, validateBody(createPldSectionSchema), async (req, res) => {
  try {
    const { item, customLabel, hasNorma, normaReferencia, descricao } = req.body
    const section = await PldBuilderService.createSection(req.user!, {
      item,
      customLabel,
      hasNorma: !!hasNorma,
      normaReferencia,
      descricao,
    })
    res.status(201).json({ section })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao criar seção') })
  }
})

router.patch('/sections/:id', authenticate, requireBuilderAccess, validateBody(updatePldSectionSchema), async (req, res) => {
  try {
    const { id } = req.params
    const section = await PldBuilderService.updateSection(req.user!, id, req.body)
    res.json({ section })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao atualizar seção') })
  }
})

router.post('/sections/reorder', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const { sectionIds } = req.body as { sectionIds: string[] }
    await PldBuilderService.reorderSections(req.user!, sectionIds)
    res.json({ message: 'Ordem atualizada' })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao reordenar seções') })
  }
})

router.delete('/sections/:id', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const { id } = req.params
    await PldBuilderService.deleteSection(req.user!, id)
    res.json({ message: 'Seção removida' })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao remover seção') })
  }
})

// Upload da norma interna
router.post(
  '/sections/:id/norma',
  authenticate,
  requireBuilderAccess,
  upload.single('file'),
  validateBody(uploadPldNormaSchema),
  async (req, res) => {
  try {
    const { id } = req.params
    const { referencia } = req.body as { referencia?: string }
    const section = await PldBuilderService.updateSection(req.user!, id, {
      hasNorma: true,
      normaReferencia: referencia || null,
    })

    if (req.file) {
      await PldBuilderService.addAttachment({
        actor: req.user!,
        sectionId: id,
        file: req.file,
        category: ATTACHMENT_CATEGORIES.NORMA,
        referenceText: referencia || null,
      })
    }

    res.json({ section })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao enviar norma') })
  }
})

// Perguntas
router.post('/questions', authenticate, requireBuilderAccess, validateBody(createPldQuestionSchema), async (req, res) => {
  try {
    const { sectionId, texto } = req.body
    const question = await PldBuilderService.createQuestion(req.user!, sectionId, texto || '')
    res.status(201).json({ question })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao criar pergunta') })
  }
})

router.patch('/questions/:id', authenticate, requireBuilderAccess, validateBody(updatePldQuestionSchema), async (req, res) => {
  try {
    const { id } = req.params
    const question = await PldBuilderService.updateQuestion(req.user!, id, req.body)
    res.json({ question })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao atualizar pergunta') })
  }
})

router.post('/questions/reorder', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const { sectionId, questionIds } = req.body as { sectionId: string; questionIds: string[] }
    await PldBuilderService.reorderQuestions(req.user!, sectionId, questionIds)
    res.json({ message: 'Ordem atualizada' })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao reordenar perguntas') })
  }
})

router.delete('/questions/:id', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const { id } = req.params
    await PldBuilderService.deleteQuestion(req.user!, id)
    res.json({ message: 'Pergunta removida' })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao remover pergunta') })
  }
})

// Upload genérico de arquivos (template, resposta, deficiência, teste)
router.post(
  '/questions/:id/upload',
  authenticate,
  requireBuilderAccess,
  upload.single('file'),
  validateBody(uploadPldAttachmentSchema),
  async (req, res) => {
  try {
    const { id } = req.params
    const { category, referenceText } = req.body as { category: AttachmentCategory; referenceText?: string }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo obrigatório' })
    }

    const att = await PldBuilderService.addAttachment({
      actor: req.user!,
      questionId: id,
      category,
      referenceText: referenceText || null,
      file: req.file,
    })

    res.status(201).json({ attachment: att })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao enviar arquivo') })
  }
})

router.delete('/attachments/:id', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const { id } = req.params
    await PldBuilderService.deleteAttachment(req.user!, id)
    res.json({ message: 'Anexo removido' })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao remover anexo') })
  }
})

// BUILDER: iniciar novo formulário (apenas limpa o builder, sem salvar)
router.post('/reset', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    await PldBuilderService.concludeBuilder(req.user!)
    res.json({ message: 'Builder limpo com sucesso' })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao limpar builder') })
  }
})

// Concluir relatório: limpa o builder para iniciar um novo
router.post('/conclude', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const { name, sentToEmail, helpTexts, metadata } = req.body as {
      name?: string
      sentToEmail?: string | null
      helpTexts?: {
        qualificacao?: string
        metodologia?: string
        recomendacoes?: string
        planoAcao?: string
      }
      metadata?: any
    }

    const saved = await PldBuilderService.concludeBuilderAndSaveForm({
      name: name ?? '',
      sentToEmail: sentToEmail ?? null,
      helpTexts: helpTexts ?? null,
      metadata: metadata ?? null,
      createdById: req.user!.id,
    })

    res.json({ message: 'Builder concluído, salvo e limpo com sucesso', form: { id: saved.id } })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Falha ao concluir relatório') })
  }
})

// BUILDER: listar formulários concluídos (salvos ao concluir)
router.get('/forms', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const forms = await PldBuilderService.listConcludedForms(req.user!)
    res.json({ forms })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao listar formulários') })
  }
})

// USER: listar formulários enviados para o usuário logado
router.get('/my-forms', authenticate, async (req, res) => {
  try {
    const userEmail = req.user?.email
    if (!userEmail) {
      return res.status(401).json({ error: 'Usuário não autenticado' })
    }
    const forms = await PldBuilderService.listFormsForUser(userEmail)
    res.json({ forms })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao listar formulários') })
  }
})

// BUILDER: deletar formulário
router.delete('/forms/:id', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const { id } = req.params
    await PldBuilderService.deleteForm(id, req.user!)
    res.json({ message: 'Formulário deletado com sucesso' })
  } catch (error: any) {
    res.status(400).json({ error: toPublicErrorMessage(error, 'Erro ao deletar formulário') })
  }
})

// BUILDER: ver um formulário concluído completo
router.get('/forms/:id', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const { id } = req.params
    const form = await PldBuilderService.getConcludedFormById(id, req.user!)
    if (!form) return res.status(404).json({ error: 'Formulário não encontrado' })
    res.json({ form })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// ADMIN: Enviar formulário para usuário
router.post('/forms/:id/send', authenticate, requireBuilderAccess, async (req, res) => {
  try {
    const { id } = req.params
    const { email, helpTexts } = req.body as {
      email: string
      helpTexts?: {
        qualificacao?: string
        metodologia?: string
        recomendacoes?: string
        planoAcao?: string
      } | null
    }
    
    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório' })
    }

    await PldBuilderService.sendFormToUser(id, email, req.user!, helpTexts ?? null)
    res.json({ message: 'Formulário enviado com sucesso' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})


// USER: Obter formulário atribuído
router.get('/forms/:id/user', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const form = await PldBuilderService.getUserForm(id, req.user!.email)
    res.json({ form })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// USER: Salvar respostas
router.post('/forms/:id/responses', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const { answers, sections, metadata } = req.body as { answers: any[]; sections?: any[]; metadata?: any }
    await PldBuilderService.saveUserFormResponses(id, req.user!.email, answers, sections, metadata)
    res.json({ message: 'Respostas salvas com sucesso' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})


// USER: Concluir formulário (somente quando 100% preenchido)
router.post('/forms/:id/complete', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    await PldBuilderService.completeUserForm(id, req.user!.email)
    res.json({ message: 'Formulário concluído com sucesso' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// USER: Upload de arquivo para uma questão do formulário
router.post('/forms/:id/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params
    const { questionId, sectionId, category, referenceText } = req.body as {
      questionId?: string
      sectionId?: string
      category: string
      referenceText?: string
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo é obrigatório' })
    }

    if (!category) {
      return res.status(400).json({ error: 'Categoria é obrigatória' })
    }

    const result = await PldBuilderService.uploadUserFormAttachment({
      formId: id,
      userEmail: req.user!.email,
      questionId,
      sectionId,
      file: req.file,
      category,
      referenceText: referenceText || null,
    })

    res.json(result)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

export default router
