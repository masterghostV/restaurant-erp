import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (process.env.SMTP_HOST) {
      const port = Number(process.env.SMTP_PORT || 587);
      const isSecure = process.env.SMTP_SECURE === 'true' || port === 465;
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: isSecure,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
        connectionTimeout: 10000, // 10s timeout
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
    }
  }

  async send(to: string, subject: string, text: string, html?: string) {
    if (!this.transporter) {
      // No SMTP provider configured — log instead of failing, so local
      // development and testing still work end-to-end.
      this.logger.warn(`[DEV EMAIL] To: ${to} | Subject: ${subject}\n${text}`);
      return { dev: true };
    }

    try {
      const from = process.env.MAIL_FROM || 'no-reply@restaurant-erp.example';
      return await this.transporter.sendMail({ from, to, subject, text, html });
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
      // Fallback: always log to console so admin/user can find OTP in Render logs even if SMTP fails
      this.logger.warn(`[FALLBACK EMAIL LOG] To: ${to} | Subject: ${subject}\n${text}`);
      return { error: err.message, devFallback: true };
    }
  }

  async sendOtp(to: string, otp: string) {
    return this.send(
      to,
      'Your verification code',
      `Your verification code is ${otp}. It expires in 10 minutes. Do not share this code with anyone.`,
      `<p>Your verification code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes. Do not share this code with anyone.</p>`,
    );
  }
}
