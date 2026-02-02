"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadPldNormaSchema = exports.uploadPldAttachmentSchema = exports.updatePldQuestionSchema = exports.createPldQuestionSchema = exports.updatePldSectionSchema = exports.createPldSectionSchema = void 0;
const joi_1 = __importDefault(require("joi"));
const common_1 = require("./common");
const TEST_REF_CATEGORIES = [
    'TEST_REQUISICAO',
    'TEST_RESPOSTA',
    'TEST_AMOSTRA',
    'TEST_EVIDENCIAS',
    'TESTE_REQUISICAO',
    'TESTE_RESPOSTA',
    'TESTE_AMOSTRA',
    'TESTE_EVIDENCIAS',
];
const ALL_ATTACHMENT_CATEGORIES = [
    'NORMA',
    'TEMPLATE',
    'RESPOSTA',
    'DEFICIENCIA',
    ...TEST_REF_CATEGORIES,
];
exports.createPldSectionSchema = joi_1.default.object({
    item: (0, common_1.alnumText)(100).required(),
    customLabel: (0, common_1.optionalAlnumText)(100),
    hasNorma: joi_1.default.boolean().optional(),
    normaReferencia: (0, common_1.optionalAlnumText)(600),
    descricao: (0, common_1.optionalAlnumText)(600),
});
exports.updatePldSectionSchema = joi_1.default.object({
    item: (0, common_1.alnumText)(100).optional(),
    customLabel: (0, common_1.optionalAlnumText)(100),
    hasNorma: joi_1.default.boolean().optional(),
    normaReferencia: (0, common_1.optionalAlnumText)(600),
    descricao: (0, common_1.optionalAlnumText)(600),
}).min(1);
exports.createPldQuestionSchema = joi_1.default.object({
    sectionId: joi_1.default.string().trim().required(),
    texto: (0, common_1.alnumText)(300).allow('').required(),
});
exports.updatePldQuestionSchema = joi_1.default.object({
    sectionId: joi_1.default.string().trim().optional(),
    texto: (0, common_1.optionalAlnumText)(300),
    aplicavel: joi_1.default.boolean().optional(),
    respondida: joi_1.default.boolean().optional(),
    templateRef: (0, common_1.optionalAlnumText)(300),
    capitulacao: (0, common_1.optionalAlnumText)(200),
    criticidade: joi_1.default.string().valid('BAIXA', 'MEDIA', 'ALTA').optional(),
    resposta: joi_1.default.string().valid('Sim', 'Não', '').allow(null).optional(),
    respostaTexto: (0, common_1.optionalAlnumText)(500),
    deficienciaTexto: (0, common_1.optionalAlnumText)(500),
    recomendacaoTexto: (0, common_1.optionalAlnumText)(300),
    testStatus: joi_1.default.string().valid('SIM', 'NAO', 'NAO_PLANO', '').allow(null).optional(),
    testDescription: (0, common_1.optionalAlnumText)(600),
    requisicaoRef: (0, common_1.optionalAlnumText)(300),
    respostaTesteRef: (0, common_1.optionalAlnumText)(300),
    amostraRef: (0, common_1.optionalAlnumText)(300),
    evidenciasRef: (0, common_1.optionalAlnumText)(300),
    actionOrigem: (0, common_1.optionalAlnumText)(300),
    actionResponsavel: (0, common_1.optionalAlnumText)(300),
    actionDescricao: (0, common_1.optionalAlnumText)(600),
    actionDataApontamento: (0, common_1.boundedDateString)(),
    actionPrazoOriginal: (0, common_1.boundedDateString)(),
    actionPrazoAtual: (0, common_1.boundedDateString)(),
    actionComentarios: (0, common_1.optionalAlnumText)(600),
}).min(1);
exports.uploadPldAttachmentSchema = joi_1.default.object({
    category: joi_1.default.string()
        .valid(...ALL_ATTACHMENT_CATEGORIES)
        .required(),
    referenceText: joi_1.default.alternatives()
        .conditional('category', {
        is: joi_1.default.string().valid(...TEST_REF_CATEGORIES),
        then: (0, common_1.optionalAlnumText)(300),
        otherwise: (0, common_1.optionalAlnumText)(600),
    })
        .optional(),
});
exports.uploadPldNormaSchema = joi_1.default.object({
    referencia: (0, common_1.optionalAlnumText)(600),
});
