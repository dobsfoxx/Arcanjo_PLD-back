import express from 'express'
import { FormService } from '../services/form.services'
import { uploadMultiple } from '../config/upload';
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import prisma from '../config/database';

const router = express.Router()

// Configurar upload de arquivos
const uploadDir = './uploads'
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    cb(null, uniqueName + ext)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Tipo de arquivo não permitido'))
    }
  }
})

// =========== TÓPICOS ===========
router.post('/topics', async (req, res) => {
  try {
    const { name, description, internalNorm } = req.body
    const topic = await FormService.createTopic(name, description, internalNorm)
    res.status(201).json({ topic })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/topics', async (req, res) => {
  try {
    const topics = await FormService.getTopics()
    res.json({ topics })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/topics/reorder', async (req, res) => {
  try {
    const { topicIds } = req.body
    await FormService.reorderTopics(topicIds)
    res.json({ message: 'Tópicos reordenados' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// Deletar tópico
router.delete('/topics/:id', async (req, res) => {
  try {
    const { id } = req.params
    await FormService.deleteTopic(id)
    res.json({ message: 'Tópico excluído com sucesso' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// =========== PERGUNTAS ===========
router.post('/questions', async (req, res) => {
  try {
    const { topicId, title, description, criticality } = req.body
    const question = await FormService.createQuestion(topicId, title, description, criticality)
    res.status(201).json({ question })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.patch('/questions/:id/applicable', async (req, res) => {
  try {
    const { id } = req.params
    const { isApplicable } = req.body
    const question = await FormService.toggleQuestionApplicable(id, isApplicable)
    res.json({ question })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.patch('/questions/reorder', async (req, res) => {
  try {
    const { topicId, questionIds } = req.body
    await FormService.reorderQuestions(topicId, questionIds)
    res.json({ message: 'Perguntas reordenadas' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})
// Deletar pergunta
router.delete('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await FormService.deleteQuestion(id);
    res.json({ message: 'Pergunta deletada com sucesso' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Atualizar pergunta
router.put('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const question = await FormService.updateQuestion(id, data);
    res.json({ question });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Reordenar perguntas
router.patch('/questions/reorder', async (req, res) => {
  try {
    const { topicId, questionIds } = req.body;
    await FormService.reorderQuestions(topicId, questionIds);
    res.json({ message: 'Perguntas reordenadas com sucesso' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});
router.post('/answers/:answerId/evidences', uploadMultiple, async (req, res) => {
  try {
    const { answerId } = req.params;
    const files = req.files as Express.Multer.File[];
    
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

    // Salvar informações dos arquivos
    const evidences = await Promise.all(
      files.map(async (file) => {
        return await prisma.evidence.create({
          data: {
            filename: file.filename,
            originalName: file.originalname,
            path: file.path,
            mimeType: file.mimetype,
            size: file.size,
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
router.post('/answers', async (req, res) => {
  try {
    const { questionId, response, justification, deficiency, recommendation } = req.body
    
    const answer = await FormService.answerQuestion(
      questionId,
      response,
      justification,
      deficiency,
      recommendation
    )
    
    res.json({ answer })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/answers/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params
    const answer = await FormService.getAnswer(questionId)
    res.json({ answer })
  } catch (error: any) {
    res.status(404).json({ error: error.message })
  }
})

// =========== UPLOAD DE ARQUIVOS ===========
router.post('/answers/:answerId/evidences', upload.array('files', 10), async (req, res) => {
  try {
    const { answerId } = req.params
    const files = req.files as Express.Multer.File[]
    
    const evidences = await Promise.all(
      files.map(async (file) => {
        return await FormService.addEvidence(
          answerId,
          file.filename,
          file.originalname,
          file.path,
          file.mimetype,
          file.size
        )
      })
    )
    
    res.status(201).json({ evidences })
  } catch (error: any) {
    // Limpar arquivos em caso de erro
    if (req.files) {
      const files = req.files as Express.Multer.File[]
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path)
        }
      })
    }
    
    res.status(400).json({ error: error.message })
  }
})

router.delete('/evidences/:id', async (req, res) => {
  try {
    const { id } = req.params
    await FormService.removeEvidence(id)
    res.json({ message: 'Evidência removida' })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// =========== PROGRESSO ===========
router.get('/progress', async (req, res) => {
  try {
    const progress = await FormService.calculateProgress()
    res.json({ progress })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/progress/topic/:topicId', async (req, res) => {
  try {
    const { topicId } = req.params
    const progress = await FormService.calculateTopicProgress(topicId)
    res.json({ progress })
  } catch (error: any) {
    res.status(404).json({ error: error.message })
  }
})

// =========== DADOS COMPLETOS ===========
router.get('/data', async (req, res) => {
  try {
    const data = await FormService.getFormData()
    res.json({ data })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router