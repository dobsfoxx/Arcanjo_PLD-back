import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { ensureDir, getUploadsRoot } from './paths'

// Garantir que a pasta de uploads existe
const uploadDir = getUploadsRoot();
ensureDir(uploadDir)

// Configuração de armazenamento
const storage = multer.diskStorage({
  destination: (req: Request, file, cb) => {
    // Criar subpasta: resposta ou template de pergunta
    let subDir = 'general';
    if (req.params.answerId) {
      subDir = `answer_${req.params.answerId}`;
    } else if (req.params.id) {
      subDir = `question_${req.params.id}`;
    }

    const fullPath = path.join(uploadDir, subDir);

    ensureDir(fullPath)
    
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueName}${extension}`);
  }
});

// Filtro de tipos de arquivo
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido. Use PDF, Word ou imagens.'));
  }
};

// Configurar multer
export const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB
  },
  fileFilter
});

// Middleware para múltiplos arquivos
export const uploadMultiple = upload.array('files', 5); // Máximo 5 arquivos