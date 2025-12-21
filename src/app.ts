import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { config } from 'dotenv'
import path from 'path'
import { getUploadsRoot } from './config/paths'
import { createSignedUrlForStoredPath, getStorageProvider } from './config/storage'

config()

const app = express()

// Segurança básica
app.use(helmet())

// Não expor assinatura do framework
app.disable('x-powered-by')

// CORS - configure via CORS_ORIGIN (lista separada por vírgula). Ex: "https://app.com,http://localhost:5173"
const corsAllowlist = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: (origin, cb) => {
      // Permitir requests sem Origin (curl, Postman, server-to-server)
      if (!origin) return cb(null, true)

      // Se não configurado, permitir apenas localhost em dev
      if (corsAllowlist.length === 0) {
        const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin)
        return cb(null, process.env.NODE_ENV !== 'production' && isLocalhost)
      }

      return cb(null, corsAllowlist.includes(origin))
    },
    credentials: true,
  })
)

// Logs de requisição
app.use(morgan('combined'))

// Body parser
app.use(express.json({ limit: '10mb' }))

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Formulário PLD API' })
})

// Rotas de autenticação
import authRoutes from './routes/auth.routes'
app.use('/api/auth', authRoutes)

// Importar rotas do formulário
import formRoutes from './routes/form.routes'
import reportRoutes from './routes/report.routes'
import pldBuilderRoutes from './routes/pldBuilder.routes'
app.use('/api/form', formRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/pld', pldBuilderRoutes)

// Arquivos estáticos (uploads, evidências, relatórios)
if (getStorageProvider() === 'supabase') {
  app.get('/uploads/*', async (req, res) => {
    try {
      const wildcard = (req.params as any)[0] as string | undefined
      const objectKey = (wildcard || '').replace(/^\/+/, '')
      if (!objectKey || objectKey.split('/').some((seg) => seg === '..')) {
        return res.status(400).json({ error: 'Caminho inválido' })
      }

      const signedUrl = await createSignedUrlForStoredPath(`uploads/${objectKey}`)
      if (!signedUrl) {
        return res.status(404).json({ error: 'Arquivo não encontrado' })
      }

      return res.redirect(signedUrl)
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao acessar arquivo' })
    }
  })
}

app.use(
  '/uploads',
  express.static(getUploadsRoot(), {
    index: false,
    dotfiles: 'deny',
  })
)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`🚀 Servidor de formulário rodando: http://localhost:${PORT}`)
})