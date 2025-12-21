"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middleware/auth");
const crypto_1 = __importDefault(require("crypto"));
// Import direto; a declaração de tipos está em src/types/nodemailer.d.ts
// Import com require para evitar problemas de resolução de tipos em tempo de compilação
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const { EmailService } = require('./email.service');
const SALT_ROUNDS = 10;
class AuthService {
    static async registerUser(name, email, password) {
        const existing = await database_1.default.user.findUnique({ where: { email } });
        if (existing) {
            throw new Error('E-mail já está em uso');
        }
        if (password.length < 8) {
            throw new Error('A senha deve ter pelo menos 8 caracteres');
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, SALT_ROUNDS);
        const user = await database_1.default.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'USER',
            },
        });
        const token = (0, auth_1.signToken)(user.id);
        return { user, token };
    }
    static async login(email, password) {
        const user = await database_1.default.user.findUnique({ where: { email } });
        if (!user) {
            throw new Error('Credenciais inválidas');
        }
        const isValid = await bcryptjs_1.default.compare(password, user.password);
        if (!isValid) {
            throw new Error('Credenciais inválidas');
        }
        if (!user.isActive) {
            throw new Error('Usuário inativo');
        }
        const token = (0, auth_1.signToken)(user.id);
        return { user, token };
    }
    /**
     * Cria o primeiro administrador do sistema se ainda não existir nenhum.
     * Para segurança, esta rota deve ser usada apenas na fase de implantação.
     */
    static async bootstrapAdmin(name, email, password) {
        const anyAdmin = await database_1.default.user.findFirst({ where: { role: 'ADMIN' } });
        if (anyAdmin) {
            throw new Error('Já existe um administrador cadastrado');
        }
        if (password.length < 10) {
            throw new Error('Senha do administrador deve ter pelo menos 10 caracteres');
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, SALT_ROUNDS);
        const user = await database_1.default.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'ADMIN',
                isTrial: false,
            },
        });
        const token = (0, auth_1.signToken)(user.id);
        return { user, token };
    }
    // Solicitar recuperação de senha: gera token e envia e-mail
    static async requestPasswordReset(email) {
        const user = await database_1.default.user.findUnique({ where: { email } });
        // Por segurança, não revelar se o usuário existe ou não
        if (!user || !user.isActive) {
            return;
        }
        const rawToken = crypto_1.default.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
        await database_1.default.passwordResetToken.create({
            data: {
                token: rawToken,
                userId: user.id,
                expiresAt,
            },
        });
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;
        await EmailService.sendMail({
            to: user.email,
            subject: 'Recuperação de senha - Sistema Arcanjo PLD',
            html: `
        <p>Olá, ${user.name}</p>
        <p>Recebemos uma solicitação de redefinição de senha para sua conta.</p>
        <p>Clique no link abaixo para criar uma nova senha (válido por 1 hora):</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Se você não solicitou esta alteração, ignore este e-mail.</p>
      `,
        });
    }
    // Redefinir senha a partir de um token válido
    static async resetPassword(token, newPassword) {
        if (newPassword.length < 8) {
            throw new Error('A nova senha deve ter pelo menos 8 caracteres');
        }
        const resetToken = await database_1.default.passwordResetToken.findUnique({
            where: { token },
            include: { user: true },
        });
        if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
            throw new Error('Token de recuperação inválido ou expirado');
        }
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, SALT_ROUNDS);
        await database_1.default.$transaction([
            database_1.default.user.update({
                where: { id: resetToken.userId },
                data: {
                    password: hashedPassword,
                },
            }),
            database_1.default.passwordResetToken.update({
                where: { id: resetToken.id },
                data: { usedAt: new Date() },
            }),
        ]);
    }
}
exports.AuthService = AuthService;
