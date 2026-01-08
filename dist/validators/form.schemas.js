"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminUpdateAnswerSchema = exports.answerQuestionSchema = exports.updateFormQuestionSchema = exports.createFormQuestionSchema = exports.createTopicSchema = void 0;
const joi_1 = __importDefault(require("joi"));
const common_1 = require("./common");
exports.createTopicSchema = joi_1.default.object({
    name: (0, common_1.alnumText)(300).required(),
    description: (0, common_1.optionalAlnumText)(600),
    internalNorm: (0, common_1.optionalAlnumText)(300),
});
exports.createFormQuestionSchema = joi_1.default.object({
    topicId: joi_1.default.string().trim().required(),
    title: (0, common_1.alnumText)(300).required(),
    description: (0, common_1.optionalAlnumText)(600),
    criticality: joi_1.default.string().trim().optional(),
    capitulation: (0, common_1.optionalAlnumText)(200),
});
exports.updateFormQuestionSchema = joi_1.default.object({
    title: (0, common_1.alnumText)(300).optional(),
    description: (0, common_1.optionalAlnumText)(600),
    criticality: joi_1.default.string().trim().optional(),
    capitulation: (0, common_1.optionalAlnumText)(200),
}).min(1);
exports.answerQuestionSchema = joi_1.default.object({
    questionId: joi_1.default.string().trim().required(),
    response: joi_1.default.boolean().required(),
    justification: (0, common_1.optionalAlnumText)(500),
    testOption: joi_1.default.string().trim().allow(null, '').optional(),
    testDescription: (0, common_1.optionalAlnumText)(600),
    correctiveActionPlan: (0, common_1.optionalAlnumText)(200),
});
exports.adminUpdateAnswerSchema = joi_1.default.object({
    questionId: joi_1.default.string().trim().required(),
    assigneeId: joi_1.default.string().trim().required(),
    response: joi_1.default.boolean().required(),
    justification: (0, common_1.optionalAlnumText)(500),
    deficiency: (0, common_1.optionalAlnumText)(500),
    recommendation: (0, common_1.optionalAlnumText)(300),
    testOption: joi_1.default.string().trim().allow(null, '').optional(),
    testDescription: (0, common_1.optionalAlnumText)(600),
    correctiveActionPlan: (0, common_1.optionalAlnumText)(200),
}).custom((value, helpers) => {
    if (value.response === false) {
        if (!value.deficiency || !String(value.deficiency).trim()) {
            return helpers.error('any.custom', { message: 'Para resposta "Não", deficiência é obrigatória' });
        }
        if (!value.recommendation || !String(value.recommendation).trim()) {
            return helpers.error('any.custom', { message: 'Para resposta "Não", recomendação é obrigatória' });
        }
    }
    return value;
});
