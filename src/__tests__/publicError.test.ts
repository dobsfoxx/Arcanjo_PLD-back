import { compactSingleLineMessage, isPrismaLikeError, toPublicErrorMessage } from '../utils/publicError';

describe('publicError utils', () => {
  describe('isPrismaLikeError', () => {
    it('returns false for non-Error values', () => {
      expect(isPrismaLikeError('x')).toBe(false);
      expect(isPrismaLikeError({})).toBe(false);
      expect(isPrismaLikeError(null)).toBe(false);
    });

    it('detects Prisma-like error names', () => {
      const err = new Error('x');
      err.name = 'PrismaClientKnownRequestError';
      expect(isPrismaLikeError(err)).toBe(true);
    });

    it('detects Prisma-like messages', () => {
      const err = new Error('Invalid `prisma.user.findMany()` invocation');
      expect(isPrismaLikeError(err)).toBe(true);
    });
  });

  describe('compactSingleLineMessage', () => {
    it('returns first line trimmed', () => {
      const msg = 'Linha 1\nLinha 2';
      expect(compactSingleLineMessage(msg)).toBe('Linha 1');
    });

    it('returns empty string for blank input', () => {
      expect(compactSingleLineMessage('')).toBe('');
      expect(compactSingleLineMessage('\n')).toBe('');
    });

    it('truncates with ellipsis when exceeding maxLen', () => {
      const msg = 'a'.repeat(10);
      expect(compactSingleLineMessage(msg, 6)).toBe('aaaaa…');
    });
  });

  describe('toPublicErrorMessage', () => {
    it('uses fallback for unknown types', () => {
      expect(toPublicErrorMessage({} as unknown, 'fallback')).toBe('fallback');
    });

    it('hides prisma errors', () => {
      const err = new Error('Invalid `prisma.user.findMany()` invocation');
      expect(toPublicErrorMessage(err)).toBe('Erro interno do servidor');
    });

    it('returns compacted message for normal errors', () => {
      const err = new Error('Mensagem\nOutra linha');
      expect(toPublicErrorMessage(err)).toBe('Mensagem');
    });

    it('accepts string errors', () => {
      expect(toPublicErrorMessage('Falha')).toBe('Falha');
    });
  });
});
