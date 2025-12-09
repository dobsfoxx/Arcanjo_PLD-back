import { FormService } from '../services/form.services'

async function initializeForm() {
  console.log('🚀 Inicializando formulário PLD...')
  
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
  const questionsByTopic: Record<string, string[]> = {
    'Política (PI)': [
      'A política de PLD está formalmente documentada e aprovada pela alta administração?',
      'A política é revisada periodicamente?',
      'Todos os funcionários têm acesso à política?'
    ],
    'Avaliação Interna de Risco (AIR)': [
      'A instituição realiza avaliação de riscos de PLD regularmente?',
      'A avaliação cobre produtos, serviços, clientes e canais de distribuição?',
      'Os resultados são documentados e usados para mitigação?'
    ],
    'Conheça seu Cliente (CSC)': [
      'Há procedimentos para identificação e verificação de clientes?',
      'É realizado monitoramento contínuo das transações?',
      'Existe classificação de clientes por nível de risco?'
    ]
  }
  
  try {
    // Criar tópicos
    console.log('📝 Criando tópicos...')
    for (const topic of topics) {
      await FormService.createTopic(topic.name, topic.description)
      console.log(`✅ Tópico criado: ${topic.name}`)
    }
    
    // Buscar tópicos criados
    const createdTopics = await FormService.getTopics()
    
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
    
    // Calcular progresso inicial
    const progress = await FormService.calculateProgress()
    console.log('\n📊 Progresso inicial:', progress)
    
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