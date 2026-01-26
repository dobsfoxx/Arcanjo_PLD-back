import prisma from '../config/database'
import fs from 'fs'
import path from 'path'
import { getUploadsRoot } from '../config/paths'
import { getStorageProvider, uploadFileToStorage } from '../config/storage'

export const ATTACHMENT_CATEGORIES = {
  NORMA: 'NORMA',
  TEMPLATE: 'TEMPLATE',
  RESPOSTA: 'RESPOSTA',
  DEFICIENCIA: 'DEFICIENCIA',
  TEST_REQUISICAO: 'TEST_REQUISICAO',
  TEST_RESPOSTA: 'TEST_RESPOSTA',
  TEST_AMOSTRA: 'TEST_AMOSTRA',
  TEST_EVIDENCIAS: 'TEST_EVIDENCIAS',
} as const

export type AttachmentCategory = typeof ATTACHMENT_CATEGORIES[keyof typeof ATTACHMENT_CATEGORIES]

// NOTE: In some VS Code/TS server states, Prisma's generated delegates can appear stale
// even after `prisma generate`. Casting here avoids blocking editor diagnostics while
// keeping runtime behavior intact.
const prismaAny = prisma as any

type BuilderActor = {
  id: string
  role: string
  isTrial: boolean
  trialExpiresAt: Date | null
  subscriptionStatus?: string | null
  subscriptionExpiresAt?: Date | null
}

const isTrialActive = (actor: BuilderActor) => {
  if (!actor.isTrial) return false
  if (!actor.trialExpiresAt) return false
  return actor.trialExpiresAt.getTime() > Date.now()
}

const hasActiveSubscription = (actor: BuilderActor) => {
  if ((actor.subscriptionStatus || '').toUpperCase() !== 'ACTIVE') return false
  if (!actor.subscriptionExpiresAt) return true
  return actor.subscriptionExpiresAt.getTime() > Date.now()
}

const coerceDateTime = (value: unknown) => {
  if (value === null || value === undefined) return value
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return null
  // `<input type="date" />` commonly sends `YYYY-MM-DD`.
  const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed
  const parsed = new Date(isoLike)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export class PldBuilderService {
  private static ensureBuilderAccess(actor: BuilderActor) {
    if (actor.role === 'ADMIN') return
    if (actor.role === 'TRIAL_ADMIN') {
      if (!isTrialActive(actor)) {
        throw new Error('Seu período de teste expirou. Finalize o pagamento para continuar.')
      }
      return
    }
    if (hasActiveSubscription(actor)) return
    throw new Error('Acesso ao builder restrito. Faça upgrade para continuar.')
  }

  private static getScopeWhere(actor: BuilderActor) {
    // O builder é multi-tenant via `createdById`.
    // Para ADMIN, usamos o escopo `createdById = null` (seções criadas por admin).
    // Isso evita listar/limpar dados de outros usuários (TRIAL/assinantes).
    if (actor.role !== 'ADMIN') return { createdById: actor.id }
    return { createdById: null }
  }

  private static async assertSectionWritable(tx: any, actor: BuilderActor, sectionId: string) {
    if (actor.role === 'ADMIN') return
    const section = await tx.pldSection.findUnique({ where: { id: sectionId }, select: { id: true, createdById: true } })
    if (!section) throw new Error('Seção não encontrada')
    if (section.createdById !== actor.id) throw new Error('Você não tem permissão para editar esta seção')
  }

  private static async assertQuestionWritable(tx: any, actor: BuilderActor, questionId: string) {
    if (actor.role === 'ADMIN') return
    const q = await tx.pldQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, section: { select: { createdById: true } } },
    })
    if (!q) throw new Error('Pergunta não encontrada')
    if (q.section?.createdById !== actor.id) throw new Error('Você não tem permissão para editar esta pergunta')
  }
  private static bestEffortDeleteLocalUpload(publicPath: string | null | undefined) {
    if (!publicPath) return
    // publicPath is stored like `uploads/<relative>`.
    const relative = publicPath.replace(/^\/+/g, '').replace(/^uploads\//, '')
    if (!relative) return
    const full = path.join(getUploadsRoot(), relative)
    try {
      if (fs.existsSync(full)) {
        fs.unlinkSync(full)
      }
    } catch {
      // best effort only
    }
  }

  private static async ensureCapacityForBuilderAttachment(params: {
    category: AttachmentCategory
    sectionId?: string
    questionId?: string
  }) {
    const existingCount = await prismaAny.pldAttachment.count({
      where: {
        category: params.category,
        sectionId: params.sectionId ?? undefined,
        questionId: params.questionId ?? undefined,
      },
    })

    if (existingCount < 5) return

    // Remove oldest to make room (keeps max 5 without blocking the user).
    const oldest = await prismaAny.pldAttachment.findFirst({
      where: {
        category: params.category,
        sectionId: params.sectionId ?? undefined,
        questionId: params.questionId ?? undefined,
      },
      orderBy: { createdAt: 'asc' },
    })

    if (oldest?.id) {
      await prismaAny.pldAttachment.delete({ where: { id: oldest.id } })
      // Best-effort local cleanup (Supabase objects are not deleted here).
      if (getStorageProvider() !== 'supabase') {
        this.bestEffortDeleteLocalUpload(oldest.path)
      }
    }
  }

  private static ensureCapacityInPayloadAttachments(container: any, category: string) {
    if (!container) return
    if (!Array.isArray(container.attachments)) container.attachments = []

    const same = container.attachments
      .map((a: any, idx: number) => ({ a, idx }))
      .filter((x: any) => x.a?.category === category)

    if (same.length < 5) return

    // Remove oldest by uploadedAt if present; fallback to first.
    let oldest = same[0]
    for (const item of same) {
      const tOld = new Date(oldest.a?.uploadedAt ?? 0).getTime()
      const tCur = new Date(item.a?.uploadedAt ?? 0).getTime()
      if (tCur < tOld) oldest = item
    }
    container.attachments.splice(oldest.idx, 1)
  }

  static async listSections(actor: BuilderActor) {
    this.ensureBuilderAccess(actor)
    const where = this.getScopeWhere(actor)
    const sections = await prismaAny.pldSection.findMany({
      where,
      include: {
        attachments: true,
        questions: {
          include: {
            attachments: true,
          },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    })

    return sections
  }

  static async createSection(
    actor: BuilderActor,
    data: {
    item: string
    customLabel?: string | null
    hasNorma?: boolean
    normaReferencia?: string | null
    descricao?: string | null
    }
  ) {
    this.ensureBuilderAccess(actor)

    const scopeWhere = this.getScopeWhere(actor)

    if (actor.role === 'TRIAL_ADMIN') {
      const existingSections = await prismaAny.pldSection.count({ where: scopeWhere })
      if (existingSections >= 3) {
        throw new Error('No modo de teste, você pode criar no máximo 3 itens de avaliação (seções).')
      }
    }

    const count = await prismaAny.pldSection.count({ where: scopeWhere })
    return prismaAny.pldSection.create({
      data: {
        ...data,
        createdById: actor.role === 'ADMIN' ? undefined : actor.id,
        order: count,
      },
    })
  }

  static async updateSection(actor: BuilderActor, id: string, data: any) {
    this.ensureBuilderAccess(actor)
    // ADMIN bypasses ownership checks; still avoid Prisma 'record not found' errors.
    const existing = await prismaAny.pldSection.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new Error('Seção não encontrada')
    await this.assertSectionWritable(prismaAny, actor, id)
    if (actor.role !== 'ADMIN') {
      // Prevent spoofing ownership.
      delete data.createdById
    }
    return prismaAny.pldSection.update({ where: { id }, data })
  }

  static async deleteSection(actor: BuilderActor, id: string) {
    this.ensureBuilderAccess(actor)
    await this.assertSectionWritable(prismaAny, actor, id)

    await prismaAny.pldSection.delete({ where: { id } })
    const remaining: Array<{ id: string }> = await prismaAny.pldSection.findMany({
      where: this.getScopeWhere(actor),
      orderBy: { order: 'asc' },
    })
    await Promise.all(
      remaining.map((s: { id: string }, idx: number) =>
        prismaAny.pldSection.update({ where: { id: s.id }, data: { order: idx } })
      )
    )
  }

  static async reorderSections(actor: BuilderActor, sectionIds: string[]) {
    this.ensureBuilderAccess(actor)
    if (actor.role !== 'ADMIN') {
      const owned = await prismaAny.pldSection.findMany({ where: { id: { in: sectionIds } }, select: { id: true, createdById: true } })
      if (owned.length !== sectionIds.length || owned.some((s: any) => s.createdById !== actor.id)) {
        throw new Error('Você não tem permissão para reordenar estas seções')
      }
    }
    await Promise.all(
      sectionIds.map((id, idx) => prismaAny.pldSection.update({ where: { id }, data: { order: idx } }))
    )
  }

  static async createQuestion(actor: BuilderActor, sectionId: string, texto: string) {
    this.ensureBuilderAccess(actor)
    const section = await prismaAny.pldSection.findUnique({ where: { id: sectionId } })
    if (!section) throw new Error('Seção não encontrada')
    if (actor.role !== 'ADMIN' && section.createdById !== actor.id) {
      throw new Error('Você não tem permissão para editar esta seção')
    }

    if (actor.role === 'TRIAL_ADMIN') {
      const totalQuestions = await prismaAny.pldQuestion.count({ where: { section: { createdById: actor.id } } })
      if (totalQuestions >= 3) {
        throw new Error('No modo de teste, você pode criar no máximo 3 questões.')
      }
    }

    const count = await prismaAny.pldQuestion.count({ where: { sectionId } })
    return prismaAny.pldQuestion.create({
      data: {
        sectionId,
        texto,
        order: count,
      },
    })
  }

  static async updateQuestion(actor: BuilderActor, id: string, data: any) {
    this.ensureBuilderAccess(actor)
    // ADMIN bypasses ownership checks; still avoid Prisma 'record not found' errors.
    const existing = await prismaAny.pldQuestion.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new Error('Pergunta não encontrada')
    await this.assertQuestionWritable(prismaAny, actor, id)
    // DEBUG: Log para verificar o que está sendo recebido
    console.log('[updateQuestion] id:', id, 'data.respondida:', data?.respondida);
    
    const cleaned = {
      ...data,
      actionDataApontamento: coerceDateTime(data?.actionDataApontamento),
      actionPrazoOriginal: coerceDateTime(data?.actionPrazoOriginal),
      actionPrazoAtual: coerceDateTime(data?.actionPrazoAtual),
    }

    const result = await prismaAny.pldQuestion.update({ where: { id }, data: cleaned })
    console.log('[updateQuestion] result.respondida:', result?.respondida);
    return result;
  }

  static async deleteQuestion(actor: BuilderActor, id: string) {
    this.ensureBuilderAccess(actor)
    await this.assertQuestionWritable(prismaAny, actor, id)
    const question = await prismaAny.pldQuestion.findUnique({ where: { id } })
    if (!question) return

    await prismaAny.pldQuestion.delete({ where: { id } })
    const remaining: Array<{ id: string }> = await prismaAny.pldQuestion.findMany({
      where: { sectionId: question.sectionId },
      orderBy: { order: 'asc' },
    })
    await Promise.all(
      remaining.map((q: { id: string }, idx: number) =>
        prismaAny.pldQuestion.update({ where: { id: q.id }, data: { order: idx } })
      )
    )
  }

  static async reorderQuestions(actor: BuilderActor, sectionId: string, ids: string[]) {
    this.ensureBuilderAccess(actor)
    if (actor.role === 'TRIAL_ADMIN') {
      await this.assertSectionWritable(prismaAny, actor, sectionId)
      const ownedQuestions = await prismaAny.pldQuestion.findMany({ where: { id: { in: ids } }, select: { id: true, sectionId: true } })
      if (ownedQuestions.length !== ids.length || ownedQuestions.some((q: any) => q.sectionId !== sectionId)) {
        throw new Error('Você não tem permissão para reordenar estas perguntas')
      }
    }
    await Promise.all(
      ids.map((id, idx) => prismaAny.pldQuestion.update({ where: { id, sectionId }, data: { order: idx } }))
    )
  }

  static async addAttachment(params: {
    actor: BuilderActor
    sectionId?: string
    questionId?: string
    file: Express.Multer.File
    category: AttachmentCategory
    referenceText?: string | null
  }) {
    const { actor, file, category, referenceText, sectionId, questionId } = params

    this.ensureBuilderAccess(actor)
    if (sectionId) await this.assertSectionWritable(prismaAny, actor, sectionId)
    if (questionId) await this.assertQuestionWritable(prismaAny, actor, questionId)

    if (!sectionId && !questionId) {
      throw new Error('sectionId ou questionId é obrigatório')
    }

    await this.ensureCapacityForBuilderAttachment({
      category,
      sectionId: sectionId ?? undefined,
      questionId: questionId ?? undefined,
    })

    const relativePath = path
      .relative(getUploadsRoot(), file.path)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')

    if (getStorageProvider() === 'supabase') {
      const objectKey = relativePath || file.filename
      await uploadFileToStorage({
        localPath: file.path,
        objectKey,
        contentType: file.mimetype,
        deleteLocal: true,
      })
    }

    const publicPath = relativePath ? `uploads/${relativePath}` : `uploads/${file.filename}`

    return prismaAny.pldAttachment.create({
      data: {
        sectionId,
        questionId,
        category,
        referenceText: referenceText || null,
        filename: file.filename,
        originalName: file.originalname,
        path: publicPath,
        mimeType: file.mimetype,
        size: file.size,
      },
    })
  }

  static async deleteAttachment(actor: BuilderActor, id: string) {
    this.ensureBuilderAccess(actor)
    if (actor.role !== 'ADMIN') {
      const att = await prismaAny.pldAttachment.findUnique({
        where: { id },
        select: {
          id: true,
          sectionId: true,
          questionId: true,
          section: { select: { createdById: true } },
          question: { select: { section: { select: { createdById: true } } } },
        },
      })
      if (!att) return
      const ownerId = att.section?.createdById ?? att.question?.section?.createdById
      if (ownerId !== actor.id) throw new Error('Você não tem permissão para remover este anexo')
    }
    await prismaAny.pldAttachment.delete({ where: { id } })
  }

  static async concludeBuilder(actor: BuilderActor) {
    this.ensureBuilderAccess(actor)
    // Start a new report cycle by clearing all builder data.
    // Order matters to satisfy FK constraints.
    if (actor.role !== 'ADMIN') {
      await prismaAny.pldAttachment.deleteMany({
        where: {
          OR: [
            { section: { createdById: actor.id } },
            { question: { section: { createdById: actor.id } } },
          ],
        },
      })
      await prismaAny.pldQuestion.deleteMany({ where: { section: { createdById: actor.id } } })
      await prismaAny.pldSection.deleteMany({ where: { createdById: actor.id } })
      return
    }

    // ADMIN: limpar apenas o escopo do admin (createdById = null)
    await prismaAny.pldAttachment.deleteMany({
      where: {
        OR: [{ section: { createdById: null } }, { question: { section: { createdById: null } } }],
      },
    })
    await prismaAny.pldQuestion.deleteMany({ where: { section: { createdById: null } } })
    await prismaAny.pldSection.deleteMany({ where: { createdById: null } })
  }

  static async concludeBuilderAndSaveForm(params: {
    name: string
    sentToEmail?: string | null
    helpTexts?: {
      qualificacao?: string
      metodologia?: string
      recomendacoes?: string
      planoAcao?: string
    } | null
    metadata?: any
    createdById: string
  }) {
    const name = params.name?.trim()
    if (!name) throw new Error('Nome do formulário é obrigatório')

    const sentToEmail = params.sentToEmail?.trim() ? params.sentToEmail.trim().toLowerCase() : null
    const helpTexts = params.helpTexts ?? null
    const metadata = params.metadata ?? null

    const actor = (await prisma.user.findUnique({ where: { id: params.createdById } })) as any as BuilderActor | null
    if (!actor) throw new Error('Usuário não encontrado')
    this.ensureBuilderAccess(actor)

    return prismaAny.$transaction(async (tx: any) => {
      const where = this.getScopeWhere(actor)
      const sections = await tx.pldSection.findMany({
        where,
        include: {
          attachments: true,
          questions: {
            include: { attachments: true },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      })

      const report = await tx.report.create({
        data: {
          name,
          type: 'BUILDER_FORM',
          format: 'JSON',
          filePath: null,
          userId: params.createdById,
          status: 'COMPLETED',
          content: JSON.stringify({
            sentToEmail,
            sections,
            helpTexts,
            metadata,
          }),
        },
      })

      // Clear builder data after snapshot is persisted.
      if (actor.role !== 'ADMIN') {
        await tx.pldAttachment.deleteMany({
          where: {
            OR: [
              { section: { createdById: actor.id } },
              { question: { section: { createdById: actor.id } } },
            ],
          },
        })
        await tx.pldQuestion.deleteMany({ where: { section: { createdById: actor.id } } })
        await tx.pldSection.deleteMany({ where: { createdById: actor.id } })
      } else {
        await tx.pldAttachment.deleteMany({
          where: {
            OR: [{ section: { createdById: null } }, { question: { section: { createdById: null } } }],
          },
        })
        await tx.pldQuestion.deleteMany({ where: { section: { createdById: null } } })
        await tx.pldSection.deleteMany({ where: { createdById: null } })
      }

      return report
    })
  }

  static async listConcludedForms(actor: BuilderActor) {
    this.ensureBuilderAccess(actor)
    const where: any = { type: 'BUILDER_FORM' }
    if (actor.role !== 'ADMIN') where.userId = actor.id

    const reports = await prismaAny.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        status: true,
        assignedToEmail: true,
        sentAt: true,
        submittedAt: true,
      },
    })

    const needsContent = reports.filter((r: any) => !r.assignedToEmail).map((r: any) => r.id)
    const contentById = new Map<string, string | null>()

    if (needsContent.length) {
      const contentRows = await prismaAny.report.findMany({
        where: { id: { in: needsContent } },
        select: { id: true, content: true },
      })
      contentRows.forEach((row: any) => contentById.set(row.id, row.content ?? null))
    }

    return reports.map((r: any) => {
      let sentToEmail: string | null = null
      const rawContent = contentById.get(r.id)
      if (rawContent) {
        try {
          const parsed = rawContent ? JSON.parse(rawContent) : null
          sentToEmail = typeof parsed?.sentToEmail === 'string' ? parsed.sentToEmail : null
        } catch {
          sentToEmail = null
        }
      }

      return {
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        status: r.status || 'DRAFT',
        sentToEmail,
        assignedToEmail: r.assignedToEmail || null,
        sentAt: r.sentAt || null,
        submittedAt: r.submittedAt || null,
      }
    })
  }

  /**
   * Lista formulários enviados para um usuário específico (pelo email).
   * Usuários só podem ver formulários atribuídos a eles.
   */
  static async listFormsForUser(email: string) {
    const normalizedEmail = email.toLowerCase()
    
    const reports = await prismaAny.report.findMany({
      where: { 
        type: 'BUILDER_FORM',
        assignedToEmail: normalizedEmail,
        status: {
          in: ['SENT_TO_USER', 'IN_PROGRESS', 'COMPLETED']
        }
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        status: true,
        assignedToEmail: true,
        sentAt: true,
        submittedAt: true,
      },
    })

    return reports.map((r: any) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      status: r.status,
      assignedToEmail: r.assignedToEmail,
      sentAt: r.sentAt || null,
      submittedAt: r.submittedAt || null,
    }))
  }

  static async deleteForm(formId: string, actor: BuilderActor) {
    this.ensureBuilderAccess(actor)
    const report = await prismaAny.report.findUnique({ where: { id: formId } })
    if (!report || report.type !== 'BUILDER_FORM') {
      throw new Error('Formulário não encontrado')
    }

    if (actor.role !== 'ADMIN' && report.userId !== actor.id) {
      throw new Error('Você não tem permissão para excluir este formulário')
    }

    await prismaAny.report.delete({ where: { id: formId } })
    return { success: true }
  }

  static async getConcludedFormById(id: string, actor: BuilderActor) {
    this.ensureBuilderAccess(actor)
    const report = await prismaAny.report.findUnique({ where: { id } })
    if (!report || report.type !== 'BUILDER_FORM') return null

    if (actor.role !== 'ADMIN' && report.userId !== actor.id) {
      throw new Error('Você não tem permissão para acessar este formulário')
    }

    let payload: any = null
    try {
      payload = report.content ? JSON.parse(report.content) : null
    } catch {
      payload = null
    }

    return {
      id: report.id,
      name: report.name,
      createdAt: report.createdAt,
      status: report.status || 'DRAFT',
      sentToEmail: typeof payload?.sentToEmail === 'string' ? payload.sentToEmail : null,
      assignedToEmail: report.assignedToEmail,
      sections: Array.isArray(payload?.sections) ? payload.sections : [],
      metadata: payload?.metadata || null,
      helpTexts: payload?.helpTexts || null,
    }
  }

  static async sendFormToUser(
    formId: string,
    email: string,
    actor: Pick<BuilderActor, 'id' | 'role'>,
    helpTexts?: {
      qualificacao?: string
      metodologia?: string
      recomendacoes?: string
      planoAcao?: string
    } | null
  ) {
    const report = await prismaAny.report.findUnique({ where: { id: formId } })
    if (!report || report.type !== 'BUILDER_FORM') {
      throw new Error('Formulário não encontrado')
    }

    if (actor.role === 'TRIAL_ADMIN' && report.userId !== actor.id) {
      throw new Error('Você não tem permissão para gerenciar este formulário')
    }

    let nextContent: string | undefined = undefined
    if (helpTexts) {
      let payload: any
      try {
        payload = report.content ? JSON.parse(report.content) : null
      } catch {
        throw new Error('Conteúdo do formulário inválido')
      }

      if (!payload || typeof payload !== 'object') {
        throw new Error('Conteúdo do formulário inválido')
      }

      payload.helpTexts = helpTexts
      nextContent = JSON.stringify(payload)
    }

    // Update status and assign to email
    await prismaAny.report.update({
      where: { id: formId },
      data: {
        status: 'SENT_TO_USER',
        assignedToEmail: email.toLowerCase(),
        sentAt: new Date(),
        ...(nextContent ? { content: nextContent } : {}),
      },
    })

    // OPCIONAL: Enviar email ao usuário
    // Descomente as linhas abaixo quando configurar SMTP
    /*
    try {
      const admin = await prismaAny.user.findUnique({ where: { id: actor.id } })
      const { sendFormToUserEmail } = await import('./formEmail.service')
      await sendFormToUserEmail({
        to: email,
        formName: report.name,
        formId,
        adminName: admin?.name,
      })
    } catch (emailError) {
      console.error('Erro ao enviar email:', emailError)
      // Não falha a operação se email falhar
    }
    */

    return { success: true }
  }

  static async getUserForm(formId: string, userEmail: string) {
    const report = await prismaAny.report.findUnique({ where: { id: formId } })
    if (!report || report.type !== 'BUILDER_FORM') {
      throw new Error('Formulário não encontrado')
    }

    // Check if user is assigned
    if (report.assignedToEmail !== userEmail.toLowerCase()) {
      throw new Error('Você não tem permissão para acessar este formulário')
    }

    let payload: any = null
    try {
      payload = report.content ? JSON.parse(report.content) : null
    } catch {
      payload = null
    }

    return {
      id: report.id,
      name: report.name,
      createdAt: report.createdAt,
      status: report.status || 'DRAFT',
      sections: Array.isArray(payload?.sections) ? payload.sections : [],
      metadata: payload?.metadata || null,
      helpTexts: payload?.helpTexts || null,
    }
  }

  static async saveUserFormResponses(formId: string, userEmail: string, answers: any[], sections?: any[], metadata?: any) {
    const report = await prismaAny.report.findUnique({ where: { id: formId } })
    if (!report || report.type !== 'BUILDER_FORM') {
      throw new Error('Formulário não encontrado')
    }

    if (report.assignedToEmail !== userEmail.toLowerCase()) {
      throw new Error('Você não tem permissão para editar este formulário')
    }

    const editableStatuses = new Set(['SENT_TO_USER', 'IN_PROGRESS'])
    if (report.status && !editableStatuses.has(report.status)) {
      throw new Error('Este formulário não pode mais ser editado')
    }

    // Parse existing content
    let payload: any = null
    try {
      payload = report.content ? JSON.parse(report.content) : null
    } catch {
      payload = { sections: [] }
    }

    // Update section responses (hasNorma, normaReferencia)
    if (Array.isArray(sections) && Array.isArray(payload?.sections)) {
      payload.sections.forEach((section: any) => {
        const sectionUpdate = sections.find((s) => s.sectionId === section.id)
        if (sectionUpdate) {
          if (typeof sectionUpdate.hasNorma === 'boolean') {
            section.hasNorma = sectionUpdate.hasNorma
          }
          if (sectionUpdate.normaReferencia !== undefined) {
            section.normaReferencia = sectionUpdate.normaReferencia || null
          }
        }
      })
    }

    // Update question responses
    if (Array.isArray(payload?.sections)) {
      payload.sections.forEach((section: any) => {
        if (Array.isArray(section.questions)) {
          section.questions.forEach((question: any) => {
            const answer = answers.find((a) => a.questionId === question.id)
            if (answer) {
              // Aplicabilidade da questão (definido pelo usuário)
              if (typeof answer.aplicavel === 'boolean') {
                question.aplicavel = answer.aplicavel
              }
              question.resposta = answer.resposta || null
              question.respostaTexto = answer.respostaTexto || null
              question.deficienciaTexto = answer.deficienciaTexto || null
              question.recomendacaoTexto = answer.recomendacaoTexto || null
              // Campos de teste
              question.testStatus = answer.testStatus || null
              question.testDescription = answer.testDescription || null
              // Referências de teste
              question.requisicaoRef = answer.requisicaoRef || null
              question.respostaTesteRef = answer.respostaTesteRef || null
              question.amostraRef = answer.amostraRef || null
              question.evidenciasRef = answer.evidenciasRef || null
              // Campos de plano de ação
              question.actionOrigem = answer.actionOrigem || null
              question.actionResponsavel = answer.actionResponsavel || null
              question.actionDescricao = answer.actionDescricao || null
              question.actionDataApontamento = coerceDateTime(answer.actionDataApontamento)
              question.actionPrazoOriginal = coerceDateTime(answer.actionPrazoOriginal)
              question.actionPrazoAtual = coerceDateTime(answer.actionPrazoAtual)
              question.actionComentarios = answer.actionComentarios || null
            }
          })
        }
      })
    }

    // Salvar metadados do formulário (instituições, qualificação, opções)
    if (metadata) {
      payload.metadata = {
        instituicoes: metadata.instituicoes || [],
        qualificacaoAvaliador: metadata.qualificacaoAvaliador || '',
        mostrarMetodologia: metadata.mostrarMetodologia || 'MOSTRAR',
        incluirRecomendacoes: metadata.incluirRecomendacoes || 'INCLUIR',
      }
    }

    // Update report with new responses
    await prismaAny.report.update({
      where: { id: formId },
      data: {
        content: JSON.stringify(payload),
        status: 'IN_PROGRESS',
      },
    })

    return { success: true }
  }

  static async completeUserForm(formId: string, userEmail: string) {
    const report = await prismaAny.report.findUnique({ where: { id: formId } })
    if (!report || report.type !== 'BUILDER_FORM') {
      throw new Error('Formulário não encontrado')
    }

    if (report.assignedToEmail !== userEmail.toLowerCase()) {
      throw new Error('Você não tem permissão para concluir este formulário')
    }

    const editableStatuses = new Set(['SENT_TO_USER', 'IN_PROGRESS'])
    if (report.status && !editableStatuses.has(report.status)) {
      throw new Error('Este formulário não pode mais ser concluído')
    }

    let payload: any = null
    try {
      payload = report.content ? JSON.parse(report.content) : null
    } catch {
      payload = null
    }

    const sections = Array.isArray(payload?.sections) ? payload.sections : []
    let totalApplicable = 0
    let totalAnswered = 0

    for (const section of sections) {
      const questions = Array.isArray(section?.questions) ? section.questions : []
      for (const question of questions) {
        const applicable = question?.aplicavel !== false
        if (!applicable) continue
        totalApplicable += 1

        const r = question?.resposta
        const answered = !(r === null || r === undefined || (typeof r === 'string' && r.trim() === ''))
        if (answered) totalAnswered += 1
      }
    }

    if (totalApplicable === 0 || totalAnswered < totalApplicable) {
      throw new Error('Formulário deve estar 100% preenchido para concluir')
    }

    await prismaAny.report.update({
      where: { id: formId },
      data: {
        status: 'COMPLETED',
        submittedAt: new Date(),
      },
    })

    return { success: true }
  }


  /**
   * Upload de arquivo pelo usuário para uma questão de um formulário.
   * Os arquivos são salvos dentro do JSON content do report.
   */
  static async uploadUserFormAttachment(params: {
    formId: string
    userEmail: string
    questionId?: string
    sectionId?: string
    file: Express.Multer.File
    category: string
    referenceText?: string | null
  }) {
    const { formId, userEmail, questionId, sectionId, file, category, referenceText } = params

    const report = await prismaAny.report.findUnique({ where: { id: formId } })
    if (!report || report.type !== 'BUILDER_FORM') {
      throw new Error('Formulário não encontrado')
    }

    if (report.assignedToEmail !== userEmail.toLowerCase()) {
      throw new Error('Você não tem permissão para editar este formulário')
    }

    // Parse existing content
    let payload: any = null
    try {
      payload = report.content ? JSON.parse(report.content) : null
    } catch {
      payload = { sections: [] }
    }

    // For user-form JSON attachments, keep at most 5 by removing the oldest.
    if (Array.isArray(payload?.sections)) {
      if (sectionId) {
        const section = payload.sections.find((s: any) => s.id === sectionId)
        if (section) this.ensureCapacityInPayloadAttachments(section, category)
      }

      if (questionId) {
        for (const section of payload.sections) {
          if (Array.isArray(section.questions)) {
            const question = section.questions.find((q: any) => q.id === questionId)
            if (question) {
              this.ensureCapacityInPayloadAttachments(question, category)
              break
            }
          }
        }
      }
    }

    const relativePath = path
      .relative(getUploadsRoot(), file.path)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')

    if (getStorageProvider() === 'supabase') {
      const objectKey = relativePath || file.filename
      await uploadFileToStorage({
        localPath: file.path,
        objectKey,
        contentType: file.mimetype,
        deleteLocal: true,
      })
    }

    const publicPath = relativePath ? `uploads/${relativePath}` : `uploads/${file.filename}`

    const newAttachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      category,
      referenceText: referenceText || null,
      filename: file.filename,
      originalName: file.originalname,
      path: publicPath,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    }

    // Add attachment to section or question
    if (Array.isArray(payload?.sections)) {
      if (sectionId) {
        const section = payload.sections.find((s: any) => s.id === sectionId)
        if (section) {
          if (!Array.isArray(section.attachments)) {
            section.attachments = []
          }
          section.attachments.push(newAttachment)
        }
      }
      
      if (questionId) {
        for (const section of payload.sections) {
          if (Array.isArray(section.questions)) {
            const question = section.questions.find((q: any) => q.id === questionId)
            if (question) {
              if (!Array.isArray(question.attachments)) {
                question.attachments = []
              }
              question.attachments.push(newAttachment)
              break
            }
          }
        }
      }
    }

    // Update report with new content
    await prismaAny.report.update({
      where: { id: formId },
      data: {
        content: JSON.stringify(payload),
      },
    })

    return { attachment: newAttachment }
  }
}
