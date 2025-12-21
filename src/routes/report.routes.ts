import express from 'express'
import fs from 'fs'
import { authenticate } from '../middleware/auth'
import { ReportService } from '../services/reportServices'
import { resolveFromUploads } from '../config/paths'
import { createSignedUrlForStoredPath, getStorageProvider } from '../config/storage'

const router = express.Router()

// Gera e retorna o relatório do usuário autenticado
router.get('/me', authenticate, async (req, res) => {
  try {
    const typeParam = (req.query.type as string | undefined)?.toUpperCase()
    const type = typeParam === 'PARTIAL' ? 'PARTIAL' : 'FULL'
    const formatParam = (req.query.format as string | undefined)?.toUpperCase()
    const format = formatParam === 'DOCX' ? 'DOCX' : 'PDF'

    const topicIdsRaw = (req.query.topicIds as string | undefined) ?? undefined
    const topicIds = topicIdsRaw
      ? topicIdsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined

    const report = await ReportService.generateUserReport(req.user!.id, type, format, topicIds)

    // Monta URL pública baseada no caminho salvo
    const filePath = report.filePath
    if (!filePath) {
      return res.status(500).json({ error: 'Falha ao localizar arquivo de relatório' })
    }

    return res.json({
      report,
      url: `/${filePath.replace(/\\/g, '/')}`,
    })
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Erro ao gerar relatório' })
  }
})

// ADMIN: gera e retorna o relatório de um usuário específico (por ID)
router.get('/user/:id', authenticate, async (req, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    const { id } = req.params
    const typeParam = (req.query.type as string | undefined)?.toUpperCase()
    const type = typeParam === 'PARTIAL' ? 'PARTIAL' : 'FULL'
    const formatParam = (req.query.format as string | undefined)?.toUpperCase()
    const format = formatParam === 'DOCX' ? 'DOCX' : 'PDF'

    const topicIdsRaw = (req.query.topicIds as string | undefined) ?? undefined
    const topicIds = topicIdsRaw
      ? topicIdsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined

    const report = await ReportService.generateUserReport(id, type, format, topicIds)

    const filePath = report.filePath
    if (!filePath) {
      return res.status(500).json({ error: 'Falha ao localizar arquivo de relatório' })
    }

    return res.json({
      report,
      url: `/${filePath.replace(/\\/g, '/')}`,
    })
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Erro ao gerar relatório do usuário' })
  }
})

// ADMIN: gera relatório com base no novo PLD Builder
router.get('/pld-builder', authenticate, async (req, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    const formatParam = (req.query.format as string | undefined)?.toUpperCase()
    const format = formatParam === 'PDF' ? 'PDF' : 'DOCX'

    const report = await ReportService.generatePldBuilderReport(req.user!.id, format)

    const filePath = report.filePath
    if (!filePath) {
      return res.status(500).json({ error: 'Falha ao localizar arquivo de relatório' })
    }

    return res.json({
      report,
      url: `/${filePath.replace(/\\/g, '/')}`,
    })
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Erro ao gerar relatório do builder' })
  }
})

// Download direto de um relatório existente, se necessário
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const { id } = req.params

    // Apenas relatórios do próprio usuário
    const report = await ReportService.getReportById(id)

    if (!report || report.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Relatório não encontrado' })
    }

    if (!report.filePath) {
      return res.status(404).json({ error: 'Arquivo de relatório não disponível' })
    }

    if (getStorageProvider() === 'supabase') {
      const signedUrl = await createSignedUrlForStoredPath(report.filePath)
      if (!signedUrl) {
        return res.status(404).json({ error: 'Arquivo de relatório não encontrado' })
      }
      return res.redirect(signedUrl)
    }

    const absolutePath = resolveFromUploads(report.filePath)
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Arquivo de relatório não encontrado no servidor' })
    }

    return res.download(absolutePath)
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Erro ao baixar relatório' })
  }
})

export default router
