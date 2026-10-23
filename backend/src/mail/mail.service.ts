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

  private async sendViaResend(to: string, subject: string, text: string, html?: string) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM || 'Restaurant ERP <onboarding@resend.dev>';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html: html || text,
      }),
    });

    const data: any = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || `Resend API error: ${response.status}`);
    }

    this.logger.log(`[Resend] Email successfully sent to ${to} (ID: ${data.id})`);
    return data;
  }

  async send(to: string, subject: string, text: string, html?: string) {
    // 1. Use Resend API if RESEND_API_KEY is configured (Port 443 HTTPS - never blocked on Render)
    if (process.env.RESEND_API_KEY) {
      try {
        return await this.sendViaResend(to, subject, text, html);
      } catch (err: any) {
        this.logger.error(`Failed to send email via Resend to ${to}: ${err.message}`);
        this.logger.warn(`[FALLBACK EMAIL LOG] To: ${to} | Subject: ${subject}\n${text}`);
        return { error: err.message, devFallback: true };
      }
    }

    // 2. Fallback to SMTP if configured
    if (this.transporter) {
      try {
        const from = process.env.MAIL_FROM || 'no-reply@restaurant-erp.example';
        return await this.transporter.sendMail({ from, to, subject, text, html });
      } catch (err: any) {
        this.logger.error(`Failed to send email via SMTP to ${to}: ${err.message}`);
        // Fallback: always log to console so admin/user can find OTP in Render logs
        this.logger.warn(`[FALLBACK EMAIL LOG] To: ${to} | Subject: ${subject}\n${text}`);
        return { error: err.message, devFallback: true };
      }
    }

    // 3. Fallback: Log to console if no email service configured
    this.logger.warn(`[DEV EMAIL] To: ${to} | Subject: ${subject}\n${text}`);
    return { dev: true };
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
