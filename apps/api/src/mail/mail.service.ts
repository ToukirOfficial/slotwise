import { mkdir, writeFile } from 'node:fs/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** .ics calendar attachment (METHOD:REQUEST or CANCEL). */
  ics?: { method: 'REQUEST' | 'CANCEL'; content: string };
}

/** tmp/mail at the repo root (works from src/ under Vitest and from dist/ at runtime). */
const MAIL_DIR = new URL('../../../../tmp/mail/', import.meta.url);

/**
 * Sends mail through SMTP when SMTP_URL is set (production). Otherwise nothing is sent: each message is
 * written to tmp/mail/*.eml so the .ics can be opened, and a line goes to the log (no address, no content).
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private readonly transport: Transporter;
  private readonly toFile: boolean;
  /** Test hook: messages "sent" in this process (test env only). */
  readonly outbox: MailMessage[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.toFile = !config.SMTP_URL;
    this.transport = this.toFile
      ? nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
      : nodemailer.createTransport(config.SMTP_URL);
  }

  async send(msg: MailMessage, label: string): Promise<void> {
    const info = await this.transport.sendMail({
      from: this.config.MAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      ...(msg.ics
        ? {
            icalEvent: { method: msg.ics.method, filename: 'appointment.ics', content: msg.ics.content },
          }
        : {}),
    });
    if (this.config.NODE_ENV === 'test') {
      this.outbox.push(msg);
      return;
    }
    if (this.toFile) {
      await mkdir(MAIL_DIR, { recursive: true });
      const file = new URL(`${Date.now()}-${label}.eml`, MAIL_DIR);
      await writeFile(file, (info as { message: Buffer }).message);
      this.log.log(`mail written to tmp/mail (${label})`);
    } else {
      this.log.log(`mail sent (${label})`);
    }
  }
}
