import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { config } from 'dotenv'

// Carregar variáveis de ambiente
config()

const app = express()

// Middlewares
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

// Importar rotas
import authRoutes from './routes/auth.routes'
import topicRoutes from './routes/topic.routes'

// Rotas
app.use('/api/auth', authRoutes)
app.use('/api/topics', topicRoutes)

// Rota de saúde
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'PLD API v1.0'
  })
})

// Rota padrão
app.get('/', (req, res) => {
  res.json({ 
    message: 'Bem-vindo à API PLD',
    docs: '/api/health',
    version: '1.0.0'
  })
})

// Tratamento de erros
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Erro:', err.message)
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

// Iniciar servidor
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
  console.log(`📡 Ambiente: ${process.env.NODE_ENV}`)
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`)
})