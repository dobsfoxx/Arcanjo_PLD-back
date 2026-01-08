"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendFormReturnedEmail = exports.sendFormSubmittedEmail = exports.sendFormToUserEmail = void 0;
const email_service_1 = require("./email.service");
/**
 * Template de email para envio de formulário ao usuário
 */
const sendFormToUserEmail = async (params) => {
    const { to, formName, formId, adminName } = params;
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const formUrl = `${appUrl}/user/form/${formId}`;
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
        .button { 
          display: inline-block; 
          background: #2563eb; 
          color: white; 
          padding: 12px 30px; 
          text-decoration: none; 
          border-radius: 8px; 
          font-weight: bold; 
          margin: 20px 0;
        }
        .footer { padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">📋 Novo Formulário Atribuído</h1>
        </div>
        
        <div class="content">
          <p>Olá,</p>
          
          <p>Você recebeu um novo formulário PLD para preenchimento${adminName ? ` de <strong>${adminName}</strong>` : ''}.</p>
          
          <p><strong>Formulário:</strong> ${formName}</p>
          
          <p>Por favor, acesse o link abaixo para preencher o formulário:</p>
          
          <p style="text-align: center;">
            <a href="${formUrl}" class="button">Acessar Formulário</a>
          </p>
          
          <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
            <strong>Instruções:</strong><br>
            1. Acesse o formulário através do link acima<br>
            2. Preencha todas as questões aplicáveis<br>
            3. Salve seu progresso sempre que necessário<br>
            4. Quando concluir, clique em "Enviar para Revisão"
          </p>
        </div>
        
        <div class="footer">
          <p>Este é um email automático do sistema Arcanjo PLD.</p>
          <p>Caso tenha dúvidas, entre em contato com o administrador.</p>
        </div>
      </div>
    </body>
    </html>
  `;
    await email_service_1.EmailService.sendMail({
        to,
        subject: `Formulário PLD: ${formName}`,
        html,
    });
};
exports.sendFormToUserEmail = sendFormToUserEmail;
/**
 * Template de email para notificar admin sobre envio para revisão
 */
const sendFormSubmittedEmail = async (params) => {
    const { to, formName, formId, userEmail } = params;
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const formUrl = `${appUrl}/admin/forms/${formId}`;
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #16a34a; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
        .button { 
          display: inline-block; 
          background: #16a34a; 
          color: white; 
          padding: 12px 30px; 
          text-decoration: none; 
          border-radius: 8px; 
          font-weight: bold; 
          margin: 20px 0;
        }
        .footer { padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">✅ Formulário Enviado para Revisão</h1>
        </div>
        
        <div class="content">
          <p>Olá Administrador,</p>
          
          <p>Um formulário foi enviado para revisão e aguarda sua análise.</p>
          
          <p><strong>Formulário:</strong> ${formName}</p>
          <p><strong>Enviado por:</strong> ${userEmail}</p>
          
          <p>Acesse o link abaixo para revisar o formulário:</p>
          
          <p style="text-align: center;">
            <a href="${formUrl}" class="button">Revisar Formulário</a>
          </p>
          
          <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
            <strong>Próximos Passos:</strong><br>
            1. Revise todas as respostas fornecidas<br>
            2. Aprove o formulário se estiver satisfatório<br>
            3. Ou devolva ao usuário com comentários para correção
          </p>
        </div>
        
        <div class="footer">
          <p>Este é um email automático do sistema Arcanjo PLD.</p>
        </div>
      </div>
    </body>
    </html>
  `;
    await email_service_1.EmailService.sendMail({
        to,
        subject: `[Revisão] ${formName} - Enviado por ${userEmail}`,
        html,
    });
};
exports.sendFormSubmittedEmail = sendFormSubmittedEmail;
/**
 * Template de email para notificar usuário sobre devolução
 */
const sendFormReturnedEmail = async (params) => {
    const { to, formName, formId, reason } = params;
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const formUrl = `${appUrl}/user/form/${formId}`;
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
        .button { 
          display: inline-block; 
          background: #dc2626; 
          color: white; 
          padding: 12px 30px; 
          text-decoration: none; 
          border-radius: 8px; 
          font-weight: bold; 
          margin: 20px 0;
        }
        .reason-box {
          background: #fef2f2;
          border: 1px solid #fecaca;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .footer { padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">🔄 Formulário Devolvido para Correção</h1>
        </div>
        
        <div class="content">
          <p>Olá,</p>
          
          <p>O formulário <strong>${formName}</strong> foi devolvido pelo administrador para correções.</p>
          
          ${reason ? `
            <div class="reason-box">
              <p style="margin: 0; font-weight: bold; color: #991b1b;">Motivo:</p>
              <p style="margin: 10px 0 0 0;">${reason}</p>
            </div>
          ` : ''}
          
          <p>Por favor, acesse o formulário, realize as correções necessárias e envie novamente para revisão.</p>
          
          <p style="text-align: center;">
            <a href="${formUrl}" class="button">Acessar Formulário</a>
          </p>
        </div>
        
        <div class="footer">
          <p>Este é um email automático do sistema Arcanjo PLD.</p>
        </div>
      </div>
    </body>
    </html>
  `;
    await email_service_1.EmailService.sendMail({
        to,
        subject: `[Correção Necessária] ${formName}`,
        html,
    });
};
exports.sendFormReturnedEmail = sendFormReturnedEmail;
