export function isPrismaLikeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const name = err.name || ''
  const msg = err.message || ''

  if (/^PrismaClient/.test(name)) return true
  if (/Invalid `.*` invocation/i.test(msg)) return true
  if (/\bPrisma\b/i.test(msg)) return true

  return false
}

export function compactSingleLineMessage(message: string, maxLen = 180): string {
  const firstLine = (message || '').split(/\r?\n/)[0]?.trim() || ''
  if (!firstLine) return ''
  if (firstLine.length <= maxLen) return firstLine
  return `${firstLine.slice(0, maxLen - 1)}…`
}

export function toPublicErrorMessage(err: unknown, fallback = 'Erro inesperado'): string {
  if (typeof err === 'string') {
    return compactSingleLineMessage(err) || fallback
  }

  if (err instanceof Error) {
    if (isPrismaLikeError(err)) return 'Erro interno do servidor'
    return compactSingleLineMessage(err.message) || fallback
  }

  return fallback
}
