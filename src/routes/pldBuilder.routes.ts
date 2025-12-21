import express from 'express'
import { authenticate, requireAdmin } from '../middleware/auth'
import { upload } from '../config/upload'
import { PldBuilderService, ATTACHMENT_CATEGORIES, type AttachmentCategory } from '../services/pldBuilder.service'

const router = express.Router()

// Listar seções com perguntas/arquivos
router.get('/sections', authenticate, async (_req, res) => {
  try {
    const data = await PldBuilderService.listSections()
    res.json({ sections: data })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/sections', authenticate, requireAdmin, async (req, res) => {
  try {
    const { item, customLabel, hasNorma, normaReferencia, descricao } = req.body
    const section = await PldBuilderService.createSection({
      item,
      customLabel,
      hasNorma: !!hasNorma,
      normaReferencia,
      descricao,
      createdById: req.user?.id,
    })
    res.status(201).json({ section })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.patch('/sections/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const section = await PldBuilderService.updateSection(id, req.body)
    res.json({ section })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/sections/reorder', authenticate, requireAdmin, async (req, res) => {
  try {
    const { sectionIds } = req.body as { sectionIds: string[] }
    await PldBuilderService.reorderSections(sectionIds)
    res.json({ message: 'Ordem atualizada' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.delete('/sections/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await PldBuilderService.deleteSection(id)
    res.json({ message: 'Seção removida' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// Upload da norma interna
router.post('/sections/:id/norma', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params
    const { referencia } = req.body as { referencia?: string }
    const section = await PldBuilderService.updateSection(id, {
      hasNorma: true,
      normaReferencia: referencia || null,
    })

    if (req.file) {
      await PldBuilderService.addAttachment({
        sectionId: id,
        file: req.file,
        category: ATTACHMENT_CATEGORIES.NORMA,
        referenceText: referencia || null,
      })
    }

    res.json({ section })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// Perguntas
router.post('/questions', authenticate, requireAdmin, async (req, res) => {
  try {
    const { sectionId, texto } = req.body
    const question = await PldBuilderService.createQuestion(sectionId, texto || '')
    res.status(201).json({ question })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.patch('/questions/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const question = await PldBuilderService.updateQuestion(id, req.body)
    res.json({ question })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/questions/reorder', authenticate, requireAdmin, async (req, res) => {
  try {
    const { sectionId, questionIds } = req.body as { sectionId: string; questionIds: string[] }
    await PldBuilderService.reorderQuestions(sectionId, questionIds)
    res.json({ message: 'Ordem atualizada' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.delete('/questions/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await PldBuilderService.deleteQuestion(id)
    res.json({ message: 'Pergunta removida' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// Upload genérico de arquivos (template, resposta, deficiência, teste)
router.post('/questions/:id/upload', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params
    const { category, referenceText } = req.body as { category: AttachmentCategory; referenceText?: string }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo obrigatório' })
    }

    const att = await PldBuilderService.addAttachment({
      questionId: id,
      category,
      referenceText: referenceText || null,
      file: req.file,
    })

    res.status(201).json({ attachment: att })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.delete('/attachments/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await PldBuilderService.deleteAttachment(id)
    res.json({ message: 'Anexo removido' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// Concluir relatório: limpa o builder para iniciar um novo
router.post('/conclude', authenticate, requireAdmin, async (_req, res) => {
  try {
    await PldBuilderService.concludeBuilder()
    res.json({ message: 'Builder concluído e limpo com sucesso' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

export default router
