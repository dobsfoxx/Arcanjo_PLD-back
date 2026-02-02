"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.bootstrapAdminSchema = exports.loginSchema = exports.registerSchema = void 0;
const joi_1 = __importDefault(require("joi"));
const strongPassword = joi_1.default.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
    .messages({
    'string.min': 'A senha deve ter pelo menos 8 caracteres',
    'string.max': 'A senha deve ter no máximo 128 caracteres',
    'string.pattern.base': 'A senha deve conter letra maiúscula, minúscula, número e símbolo',
});
exports.registerSchema = joi_1.default.object({
    name: joi_1.default.string().trim().min(2).max(80).required(),
    email: joi_1.default.string().trim().email({ tlds: { allow: false } }).required(),
    password: strongPassword.required(),
    startTrial: joi_1.default.boolean().optional(),
});
exports.loginSchema = joi_1.default.object({
    email: joi_1.default.string().trim().email({ tlds: { allow: false } }).required(),
    password: joi_1.default.string().min(1).max(128).required(),
});
exports.bootstrapAdminSchema = joi_1.default.object({
    name: joi_1.default.string().trim().min(2).max(80).required(),
    email: joi_1.default.string().trim().email({ tlds: { allow: false } }).required(),
    password: strongPassword.min(12).required().messages({
        'string.min': 'Senha do administrador deve ter pelo menos 12 caracteres',
    }),
});
exports.forgotPasswordSchema = joi_1.default.object({
    email: joi_1.default.string().trim().email({ tlds: { allow: false } }).required(),
});
exports.resetPasswordSchema = joi_1.default.object({
    token: joi_1.default.string().trim().min(20).max(200).required(),
    password: strongPassword.required(),
});
exports.googleSchema = joi_1.default.object({
    credential: joi_1.default.string().trim().min(10).required(),
});
