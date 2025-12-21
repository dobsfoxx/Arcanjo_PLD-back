"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadMultiple = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const paths_1 = require("./paths");
// Garantir que a pasta de uploads existe
const uploadDir = (0, paths_1.getUploadsRoot)();
(0, paths_1.ensureDir)(uploadDir);
// Configuração de armazenamento
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        // Criar subpasta: resposta ou template de pergunta
        let subDir = 'general';
        if (req.params.answerId) {
            subDir = `answer_${req.params.answerId}`;
        }
        else if (req.params.id) {
            subDir = `question_${req.params.id}`;
        }
        const fullPath = path_1.default.join(uploadDir, subDir);
        (0, paths_1.ensureDir)(fullPath);
        cb(null, fullPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const extension = path_1.default.extname(file.originalname);
        cb(null, `${uniqueName}${extension}`);
    }
});
// Filtro de tipos de arquivo
const fileFilter = (req, file, cb) => {
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
    }
    else {
        cb(new Error('Tipo de arquivo não permitido. Use PDF, Word ou imagens.'));
    }
};
// Configurar multer
exports.upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB
    },
    fileFilter
});
// Middleware para múltiplos arquivos
exports.uploadMultiple = exports.upload.array('files', 10); // Máximo 10 arquivos
