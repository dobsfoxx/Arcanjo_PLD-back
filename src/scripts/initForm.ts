import { FormService } from '../services/form.services'
import prisma from '../config/database'

async function initializeForm() {
  console.log('🚀 Inicializando formulário PLD...')

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!admin) {
    throw new Error('Nenhum usuário ADMIN encontrado. Crie um ADMIN antes de executar o seed.')
  }
  
  // Tópicos do PLD (conforme seu documento)
  const topics = [
    {
      name: 'Política (PI)',
      description: 'Política Interna de Prevenção à Lavagem de Dinheiro'
    },
    {
      name: 'Avaliação Interna de Risco (AIR)',
      description: 'Avaliação de riscos de PLD'
    },
    {
      name: 'Avaliação de Novos Produtos (ANPST)',
      description: 'Avaliação de novos produtos, serviços e tecnologia'
    },
    {
      name: 'Governança (GOV)',
      description: 'Estrutura de governança e compliance'
    },
    {
      name: 'Conheça seu Cliente (CSC)',
      description: 'Procedimentos de due diligence'
    }
  ]
  
  // Perguntas exemplo para cada tópico
  const questionsByTopic: { [key: string]: string[] } = {
    'Política (PI)': [
      'A política de PLD está atualizada?',
    ],
    'Avaliação Interna de Risco (AIR)': [
      'Quais são os principais riscos identificados?',
    ],
    'Avaliação de Novos Produtos (ANPST)': [
      'Os novos produtos foram avaliados quanto ao risco de PLD?',
    ],
    'Governança (GOV)': [
      'Existe um comitê de compliance ativo?',
    ],
    'Conheça seu Cliente (CSC)': [
      'Os procedimentos de due diligence são seguidos corretamente?',
    ],
  }
  try {
    // Criar tópicos
    console.log('📝 Criando tópicos...')
    for (const topic of topics) {
      await FormService.createTopic(admin.id, topic.name, topic.description)
      console.log(`✅ Tópico criado: ${topic.name}`)
    }
    
    // Buscar tópicos criados
    const createdTopics = await FormService.getTopics(admin.id, 'ADMIN')
    
    // Criar perguntas para cada tópico
    console.log('\n📝 Criando perguntas...')
    for (const topic of createdTopics) {
      const questions = questionsByTopic[topic.name] || []
      
      for (const questionText of questions) {
        await FormService.createQuestion(
          topic.id,
          questionText,
          'Descrição da pergunta...',
          ['BAIXA', 'MEDIA', 'ALTA'][Math.floor(Math.random() * 3)]
        )
        console.log(`✅ Pergunta criada em ${topic.name}: ${questionText.substring(0, 50)}...`)
      }
    }
    
    console.log('\n🎉 Formulário inicializado com sucesso!')
    console.log('📊 Tópicos criados:', createdTopics.length)
    
  } catch (error) {
    console.error('❌ Erro ao inicializar:', error)
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  initializeForm()
}

export { initializeForm }