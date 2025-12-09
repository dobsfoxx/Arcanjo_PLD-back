import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'

config()

const app = express()
app.use(cors())
app.use(express.json())

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Formulário PLD API' })
})

// Importar rotas do formulário
import  formRoutes  from './routes/form.routes'
import path from 'path/win32'
app.use('/api/form', formRoutes)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`🚀 Servidor de formulário rodando: http://localhost:${PORT}`)
})