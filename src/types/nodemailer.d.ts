declare module 'nodemailer' {
  // Minimal type declarations to satisfy TypeScript; for full types install @types/nodemailer.
  interface TransporterOptions {
    host: string;
    port: number;
    secure?: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  }

  interface SendMailOptions {
    from?: string;
    to: string;
    subject: string;
    html: string;
  }

  export interface Transporter {
    sendMail(options: SendMailOptions): Promise<unknown>;
    verify(): Promise<boolean>;

  }

  export function createTransport(options: TransporterOptions): Transporter;

  // Utilitário usado em desenvolvimento para criar contas de teste
  export interface TestAccount {
    user: string;
    pass: string;
    smtp: {
      host: string;
      port: number;
      secure: boolean;
    };
  }

  export function createTestAccount(): Promise<TestAccount>;
}