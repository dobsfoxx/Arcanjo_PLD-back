"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const publicError_1 = require("../utils/publicError");
describe('publicError utils', () => {
    describe('isPrismaLikeError', () => {
        it('returns false for non-Error values', () => {
            expect((0, publicError_1.isPrismaLikeError)('x')).toBe(false);
            expect((0, publicError_1.isPrismaLikeError)({})).toBe(false);
            expect((0, publicError_1.isPrismaLikeError)(null)).toBe(false);
        });
        it('detects Prisma-like error names', () => {
            const err = new Error('x');
            err.name = 'PrismaClientKnownRequestError';
            expect((0, publicError_1.isPrismaLikeError)(err)).toBe(true);
        });
        it('detects Prisma-like messages', () => {
            const err = new Error('Invalid `prisma.user.findMany()` invocation');
            expect((0, publicError_1.isPrismaLikeError)(err)).toBe(true);
        });
    });
    describe('compactSingleLineMessage', () => {
        it('returns first line trimmed', () => {
            const msg = 'Linha 1\nLinha 2';
            expect((0, publicError_1.compactSingleLineMessage)(msg)).toBe('Linha 1');
        });
        it('returns empty string for blank input', () => {
            expect((0, publicError_1.compactSingleLineMessage)('')).toBe('');
            expect((0, publicError_1.compactSingleLineMessage)('\n')).toBe('');
        });
        it('truncates with ellipsis when exceeding maxLen', () => {
            const msg = 'a'.repeat(10);
            expect((0, publicError_1.compactSingleLineMessage)(msg, 6)).toBe('aaaaa…');
        });
    });
    describe('toPublicErrorMessage', () => {
        it('uses fallback for unknown types', () => {
            expect((0, publicError_1.toPublicErrorMessage)({}, 'fallback')).toBe('fallback');
        });
        it('hides prisma errors', () => {
            const err = new Error('Invalid `prisma.user.findMany()` invocation');
            expect((0, publicError_1.toPublicErrorMessage)(err)).toBe('Erro interno do servidor');
        });
        it('returns compacted message for normal errors', () => {
            const err = new Error('Mensagem\nOutra linha');
            expect((0, publicError_1.toPublicErrorMessage)(err)).toBe('Mensagem');
        });
        it('accepts string errors', () => {
            expect((0, publicError_1.toPublicErrorMessage)('Falha')).toBe('Falha');
        });
    });
});
