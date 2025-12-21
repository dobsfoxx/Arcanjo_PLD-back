import express from 'express'
import path from 'path'
import { FormService } from '../services/form.services'
import { upload, uploadMultiple } from '../config/upload'
import fs from 'fs'
import prisma from '../config/database'
import { authenticate, requireAdmin } from '../middleware/auth'
import { getUploadsRoot, resolveFromUploads, stripUploadsPrefix } from '../config/paths'
import { getStorageProvider, uploadFileToStorage, createSignedUrlForStoredPath } from '../config/storage'

const router = express.Router()

// =========== TÓPICOS ===========
router.post('/topics', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description, internalNorm } = req.body
    const userId = req.user!.id
    const topic = await FormService.createTopic(userId, name, description, internalNorm)
    res.status(201).json({ topic })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/topics', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id
    const role = req.user!.role
    const topics = await FormService.getTopics(userId, role)
    res.json({ topics })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Atualizar norma interna (texto + arquivo) de um tópico
router.post('/topics/:id/norm', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.id
    const role = req.user!.role

    const topic = await prisma.topic.findUnique({ where: { id } })
    if (!topic) {
      return res.status(404).json({ error: 'Tópico não encontrado' })
    }

    if (topic.assignedToId !== userId) {
      return res.status(403).json({ error: 'Apenas o usuário designado pode editar a norma deste tópico' })
    }

    const { description, internalNorm, removeFile } = req.body as { description?: string; internalNorm?: string; removeFile?: string }

    // IMPORTANTE: `internalNorm` é usado como nome/identificação do formulário (agrupamento).
    // A referência/descrição da norma interna do tópico deve ficar em `description`.
    const normReferenceText = (description ?? internalNorm) ?? null

    const data: any = {
      description: typeof normReferenceText === 'string' && normReferenceText.trim() ? normReferenceText.trim() : null,
    }

    if (req.file) {
      const relativePath = path
        .relative(getUploadsRoot(), req.file.path)
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')

      if (getStorageProvider() === 'supabase') {
        await uploadFileToStorage({
          localPath: req.file.path,
          objectKey: relativePath,
          contentType: req.file.mimetype,
          deleteLocal: true,
        })
      }

      data.normFilename = req.file.filename
      data.normOriginalName = req.file.originalname
      data.normPath = relativePath
      data.normMimeType = req.file.mimetype
      data.normSize = req.file.size
    } else if (removeFile === 'true') {
      data.normFilename = null
      data.normOriginalName = null
      data.normPath = null
      data.normMimeType = null
      data.normSize = null
    }

    const updated = await prisma.topic.update({
      where: { id },
      data,
    })

    res.json({ topic: updated })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// ADMIN: listar tópicos de um usuário específico para revisão
router.get('/topics/for-user/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const topics = await FormService.getTopicsByAssignee(id)
    res.json({ topics })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/topics/reorder', authenticate, requireAdmin, async (req, res) => {
  try {
    const { topicIds } = req.body
    await FormService.reorderTopics(topicIds)
    res.json({ message: 'Tópicos reordenados' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// Deletar tópico
router.delete('/topics/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await FormService.deleteTopic(id)
    res.json({ message: 'Tópico excluído com sucesso' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// Atribuir tópico a um usuário (ADMIN)
router.post('/topics/:id/assign', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { email } = req.body
    const adminId = req.user!.id

    const topic = await FormService.assignTopicToUser(id, adminId, email)
    res.json({ topic })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// Atribuir TODOS os tópicos criados pelo admin a um usuário (ADMIN)
router.post('/topics/assign-all', authenticate, requireAdmin, async (req, res) => {
  try {
    const { email } = req.body
    const adminId = req.user!.id

    const topics = await FormService.assignAllTopicsToUser(adminId, email)
    res.json({ topics })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// ADMIN: limpar arquivos da pasta uploads (exceto relatórios)
router.delete('/uploads/clean', authenticate, requireAdmin, async (_req, res) => {
  try {
    const uploadsDir = getUploadsRoot()
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ message: 'Nenhum diretório de uploads encontrado' })
    }

    const entries = fs.readdirSync(uploadsDir, { withFileTypes: true })
    entries.forEach(entry => {
      if (entry.name === 'reports') {
        return
      }
      const target = path.join(uploadsDir, entry.name)
      fs.rmSync(target, { recursive: true, force: true })
    })

    return res.json({ message: 'Uploads removidos com sucesso (reports preservados)' })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Erro ao limpar uploads' })
  }
})

// =========== PERGUNTAS ===========
router.post('/questions', authenticate, requireAdmin, async (req, res) => {
  try {
    const { topicId, title, description, criticality, capitulation } = req.body
    const question = await FormService.createQuestion(topicId, title, description, criticality, capitulation)
    res.status(201).json({ question })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// ADMIN: anexar arquivo-modelo (em branco) para o usuário preencher
router.post('/questions/:id/template', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params

    const question = await prisma.question.findUnique({ where: { id } })
    if (!question) {
      return res.status(404).json({ error: 'Pergunta não encontrada' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' })
    }

    const allowed = [
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]

    if (!allowed.includes(req.file.mimetype)) {
      // Limpar arquivo se tipo não permitido
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path)
      }
      return res.status(400).json({
        error: 'Tipo de arquivo não permitido. Use TXT, XLSX, DOC ou DOCX.',
      })
    }

    const relativePath = path
      .relative(getUploadsRoot(), req.file.path)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')

    if (getStorageProvider() === 'supabase') {
      await uploadFileToStorage({
        localPath: req.file.path,
        objectKey: relativePath,
        contentType: req.file.mimetype,
        deleteLocal: true,
      })
    }

    const updated = await prisma.question.update({
      where: { id },
      data: {
        templateFilename: req.file.filename,
        templateOriginalName: req.file.originalname,
        templatePath: relativePath,
        templateMimeType: req.file.mimetype,
        templateSize: req.file.size,
      } as any,
    })

    res.json({ question: updated })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// USER/ADMIN: baixar arquivo-modelo (força download)
router.get('/questions/:id/template/download', authenticate, async (req, res) => {
  try {
    const { id } = req.params

    const question = await prisma.question.findUnique({ where: { id } })
    if (!question) {
      return res.status(404).json({ error: 'Pergunta não encontrada' })
    }

    if (!question.templatePath) {
      return res.status(404).json({ error: 'Nenhum arquivo-modelo anexado' })
    }

    if (getStorageProvider() === 'supabase') {
      const storedPath = `uploads/${stripUploadsPrefix(question.templatePath)}`
      const signedUrl = await createSignedUrlForStoredPath(storedPath)
      if (!signedUrl) {
        return res.status(404).json({ error: 'Arquivo-modelo não encontrado' })
      }
      return res.redirect(signedUrl)
    }

    // NOTE: templatePath é salvo como caminho relativo (sem garantir prefixo 'uploads/')
    // e em produção UPLOAD_PATH pode estar fora do projeto.
    const resolvedPath = resolveFromUploads(question.templatePath)
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Arquivo-modelo não encontrado no servidor' })
    }

    const downloadName = (question as any).templateOriginalName || (question as any).templateFilename || 'arquivo-modelo'
    return res.download(resolvedPath, downloadName)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.patch('/questions/:id/applicable', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const { isApplicable } = req.body
    const actorId = req.user!.id
    const role = req.user!.role
    const question = await FormService.toggleQuestionApplicable(id, isApplicable, actorId, role)
    res.json({ question })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.patch('/questions/reorder', authenticate, requireAdmin, async (req, res) => {
  try {
    const { topicId, questionIds } = req.body
    await FormService.reorderQuestions(topicId, questionIds)
    res.json({ message: 'Perguntas reordenadas' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})
// Deletar pergunta
router.delete('/questions/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await FormService.deleteQuestion(id);
    res.json({ message: 'Pergunta deletada com sucesso' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Atualizar pergunta
router.put('/questions/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const question = await FormService.updateQuestion(id, data);
    res.json({ question });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/answers/:answerId/evidences', authenticate, uploadMultiple, async (req, res) => {
  try {
    const { answerId } = req.params;
    const files = req.files as Express.Multer.File[];
    const category = (req.body as any)?.category as string | undefined;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // Verificar se resposta existe
    const answer = await prisma.answer.findUnique({
      where: { id: answerId }
    });

    if (!answer) {
      // Limpar arquivos enviados
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      
      return res.status(404).json({ error: 'Resposta não encontrada' });
    }

    // Verificar se a resposta pertence ao usuário autenticado
    if (answer.userId !== req.user!.id) {
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      return res.status(403).json({ error: 'Não é permitido anexar evidências a respostas de outro usuário' })
    }

    // Salvar informações dos arquivos com caminho relativo para servir via /uploads
    const evidences = await Promise.all(
      files.map(async (file) => {
        const relative = path
          .relative(getUploadsRoot(), file.path)
          .replace(/\\/g, '/')
          .replace(/^\/+/, '')
        const publicPath = relative ? `uploads/${relative}` : `uploads/${file.filename}`;

        if (getStorageProvider() === 'supabase') {
          await uploadFileToStorage({
            localPath: file.path,
            objectKey: relative,
            contentType: file.mimetype,
            deleteLocal: true,
          })
        }

        return await prisma.evidence.create({
          data: {
            filename: file.filename,
            originalName: file.originalname,
            path: publicPath,
            mimeType: file.mimetype,
            size: file.size,
            category: category ?? 'GENERAL',
            answerId
          }
        });
      })
    );

    res.status(201).json({
      message: 'Arquivos enviados com sucesso',
      evidences
    });
  } catch (error: any) {
    // Limpar arquivos em caso de erro
    if (req.files) {
      const files = req.files as Express.Multer.File[];
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    res.status(500).json({
      error: 'Erro ao enviar arquivos',
      details: error.message
    });
  }
});

// =========== RESPOSTAS ===========
router.post('/answers', authenticate, async (req, res) => {
  try {
    const { questionId, response, justification, testOption, testDescription, correctiveActionPlan } = req.body
    const userId = req.user!.id
    
    const answer = await FormService.answerQuestion(
      questionId,
      userId,
      response,
      justification,
      testOption,
      testDescription,
      correctiveActionPlan,
    )
    
    res.json({ answer })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// ADMIN: atualizar resposta de um usuário específico durante a revisão
router.post('/admin/answers', authenticate, requireAdmin, async (req, res) => {
  try {
    const { questionId, assigneeId, response, justification, deficiency, recommendation, testOption, testDescription, correctiveActionPlan } = req.body
    const answer = await FormService.adminUpdateAnswer(
      questionId,
      assigneeId,
      response,
      justification,
      deficiency,
      recommendation,
      testOption,
      testDescription,
      correctiveActionPlan,
    )
    res.json({ answer })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// USER: enviar respostas do tópico para revisão do administrador
router.post('/topics/:id/submit', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.id
    const topic = await FormService.submitTopic(id, userId)
    res.json({ topic })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// USER: enviar TODOS os tópicos atribuídos para revisão do administrador
router.post('/topics/submit-all', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id
    const topics = await FormService.submitAllTopics(userId)
    res.json({ topics })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// ADMIN: devolver tópico para usuário ajustar
router.post('/topics/:id/return', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const adminId = req.user!.id
    const topic = await FormService.returnTopic(id, adminId)
    res.json({ topic })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// ADMIN: devolver TODOS os tópicos enviados de um usuário para ajustes
router.post('/topics/return-all/:assigneeId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { assigneeId } = req.params
    const adminId = req.user!.id
    const topics = await FormService.returnAllTopicsForUser(assigneeId, adminId)
    res.json({ topics })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// ADMIN: aprovar/concluir tópico
router.post('/topics/:id/approve', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const adminId = req.user!.id
    const topic = await FormService.approveTopic(id, adminId)
    res.json({ topic })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/answers/:questionId', authenticate, async (req, res) => {
  try {
    const { questionId } = req.params
    const userId = req.user!.id
    const answer = await FormService.getAnswer(questionId, userId)
    res.json({ answer })
  } catch (error: any) {
    res.status(404).json({ error: error.message })
  }
})

router.delete('/evidences/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params

    // Verifica se a evidência pertence a uma resposta do usuário
    const evidence = await prisma.evidence.findUnique({
      where: { id },
      include: { answer: true },
    })

    if (!evidence || evidence.answer.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Não é permitido remover evidências de outro usuário' })
    }

    await FormService.removeEvidence(id)
    res.json({ message: 'Evidência removida' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// =========== PROGRESSO ===========
router.get('/progress', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id
    const progress = await FormService.calculateProgress(userId)
    res.json({ progress })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/progress/topic/:topicId', authenticate, async (req, res) => {
  try {
    const { topicId } = req.params
    const userId = req.user!.id
    const progress = await FormService.calculateTopicProgress(topicId, userId)
    res.json({ progress })
  } catch (error: any) {
    res.status(404).json({ error: error.message })
  }
})

// =========== DADOS COMPLETOS ===========
router.get('/data', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id
    const data = await FormService.getFormData(userId)
    res.json({ data })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router