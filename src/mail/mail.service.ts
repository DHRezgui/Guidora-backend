import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { SupportEmailBrand } from './support-email-brand';
import { resolveSupportEmailBrand } from './support-email-brand';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);
  private readonly fromEmail: string;
  private readonly frontendUrl: string;

  private parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return defaultValue;
  }

  constructor(private readonly configService: ConfigService) {
    this.fromEmail = this.configService.get<string>('MAIL_FROM') || 'noreply@trustdev.com';
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    const mailSecure = this.parseBoolean(this.configService.get<string>('MAIL_SECURE'), false);
    const mailTlsRejectUnauthorized = this.parseBoolean(
      this.configService.get<string>('MAIL_TLS_REJECT_UNAUTHORIZED'),
      true,
    );

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST') || 'smtp.gmail.com',
      port: parseInt(this.configService.get<string>('MAIL_PORT') || '587', 10),
      secure: mailSecure,
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASSWORD'),
      },
      tls: {
        rejectUnauthorized: mailTlsRejectUnauthorized,
      },
    });
  }

  async sendPasswordResetEmail(email: string, token: string, firstName?: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;
    const name = firstName || 'Utilisateur';

    try {
      await this.transporter.sendMail({
        from: `"Guidora Onboarding" <${this.fromEmail}>`,
        to: email,
        subject: 'Réinitialisation de votre mot de passe - Guidora',
        html: `
          <div style="margin:0;padding:24px;background:#050b16;font-family:'Segoe UI',Tahoma,sans-serif;">
            <div style="max-width:600px;margin:0 auto;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);background:linear-gradient(135deg,#0b1428,#0a1730 45%,#12102a 100%);box-shadow:0 20px 60px rgba(0,0,0,0.45);">
              <div style="padding:28px 28px 8px;text-align:center;">
                <div style="display:inline-block;background:linear-gradient(135deg,#ff6b00,#bb008c);border:1px solid rgba(255,255,255,0.2);border-radius:14px;padding:12px 14px;box-shadow:0 0 24px rgba(255,107,0,0.28);">
                  <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">GO</span>
                </div>
                <h1 style="margin:18px 0 0;color:#f8fafc;font-size:26px;line-height:1.2;">Réinitialisation du mot de passe</h1>
                <p style="margin:10px 0 0;color:#cbd5e1;font-size:14px;">Lien sécurisé Guidora Onboarding</p>
              </div>
              <div style="padding:20px 28px 30px;">
                <p style="margin:0 0 14px;color:#e2e8f0;font-size:15px;line-height:1.7;">Bonjour <strong>${name}</strong>,</p>
                <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.7;">
                  Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :
                </p>
                <div style="text-align:center;margin:26px 0;">
                  <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#ff6b00,#bb008c);color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:12px;font-weight:700;font-size:15px;box-shadow:0 0 22px rgba(255,107,0,0.28);">
                    Réinitialiser mon mot de passe
                  </a>
                </div>
                <div style="border:1px solid rgba(255,255,255,0.1);background:rgba(15,23,42,0.55);border-radius:12px;padding:12px 14px;">
                  <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
                    Ce lien est valable pendant <strong style="color:#f8fafc;">1 heure</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
                  </p>
                </div>
                <p style="margin:18px 0 0;color:#64748b;font-size:12px;text-align:center;">
                  Guidora Onboarding &copy; ${new Date().getFullYear()}
                </p>
              </div>
            </div>
          </div>
        `,
      });
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
      throw error;
    }
  }

  async sendEmailVerification(email: string, token: string, firstName?: string): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${token}`;
    const name = firstName || 'Utilisateur';

    try {
      await this.transporter.sendMail({
        from: `"Guidora Onboarding" <${this.fromEmail}>`,
        to: email,
        subject: 'Vérifiez votre adresse email - Guidora',
        html: `
          <div style="margin:0;padding:24px;background:#050b16;font-family:'Segoe UI',Tahoma,sans-serif;">
            <div style="max-width:600px;margin:0 auto;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);background:linear-gradient(135deg,#0b1428,#0a1730 45%,#12102a 100%);box-shadow:0 20px 60px rgba(0,0,0,0.45);">
              <div style="padding:28px 28px 8px;text-align:center;">
                <div style="display:inline-block;background:linear-gradient(135deg,#ff6b00,#bb008c);border:1px solid rgba(255,255,255,0.2);border-radius:14px;padding:12px 14px;box-shadow:0 0 24px rgba(255,107,0,0.28);">
                  <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">G</span>
                </div>
                <h1 style="margin:18px 0 0;color:#f8fafc;font-size:26px;line-height:1.2;">Vérification de votre email</h1>
                <p style="margin:10px 0 0;color:#cbd5e1;font-size:14px;">Lien sécurisé Guidora Onboarding</p>
              </div>
              <div style="padding:20px 28px 30px;">
                <p style="margin:0 0 14px;color:#e2e8f0;font-size:15px;line-height:1.7;">Bonjour <strong>${name}</strong>,</p>
                <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.7;">
                  Merci de votre inscription ! Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse email :
                </p>
                <div style="text-align:center;margin:26px 0;">
                  <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#ff6b00,#bb008c);color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:12px;font-weight:700;font-size:15px;box-shadow:0 0 22px rgba(255,107,0,0.28);">
                    Vérifier mon email
                  </a>
                </div>
                <div style="border:1px solid rgba(255,255,255,0.1);background:rgba(15,23,42,0.55);border-radius:12px;padding:12px 14px;">
                  <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
                    Ce lien est valable pendant <strong style="color:#f8fafc;">24 heures</strong>. Si vous n'avez pas créé de compte, ignorez cet email.
                  </p>
                </div>
                <p style="margin:18px 0 0;color:#64748b;font-size:12px;text-align:center;">
                  Guidora Onboarding &copy; ${new Date().getFullYear()}
                </p>
              </div>
            </div>
          </div>
        `,
      });
      this.logger.log(`Email verification sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send email verification to ${email}`, error);
      throw error;
    }
  }

  private isMailConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('MAIL_USER') &&
        this.configService.get<string>('MAIL_PASSWORD'),
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatMultilineHtml(value: string): string {
    return this.escapeHtml(value).replace(/\r\n|\r|\n/g, '<br/>');
  }

  private truncateText(value: string, max = 400): string {
    const trimmed = value.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max)}…`;
  }

  /** Header-safe subject line: labeled + truncated so long titles don’t break the layout. */
  private supportRefSubtitleHtml(ref: string, subject: string, maxSubjectChars = 48): string {
    const truncated = this.truncateText(subject, maxSubjectChars);
    const subjectSafe = this.escapeHtml(truncated);
    return `Réf. <strong style="color:#e2e8f0;">#${ref}</strong>
      · Sujet&nbsp;: <strong style="color:#f8fafc;">${subjectSafe}</strong>`;
  }

  private supportSubjectReminderHtml(subject: string, withBottomMargin = true): string {
    const subjectSafe = this.escapeHtml(subject.trim());
    const margin = withBottomMargin ? '0 0 14px' : '0';
    return `
      <p style="margin:0 0 6px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
        Sujet
      </p>
      <p style="margin:${margin};color:#f8fafc;font-size:14px;font-weight:600;line-height:1.45;word-break:break-word;">
        ${subjectSafe}
      </p>`;
  }

  /** Admin-facing diagnostic summary — never includes supportBrand / visual config. */
  private supportTicketContextSummaryHtml(
    summary?: {
      browser?: string | null;
      faqLastQuery?: string | null;
      faqSearchCount?: number | null;
      navigationHistory?: string[] | null;
      assistanceState?: string | null;
      activeTourId?: string | null;
      lastCompletedTourId?: string | null;
      lastCompletedTourName?: string | null;
      episode?: {
        trigger?: string;
        frictionAtTrigger?: number;
        riskAtTrigger?: number;
        timeOnPageAtTrigger?: number;
      } | null;
    } | null,
  ): string {
    if (!summary) return '';
    const rows: string[] = [];
    if (summary.episode?.trigger) {
      const triggerLabel =
        summary.episode.trigger === 'proactiveToast'
          ? 'Suggestion d’aide automatique'
          : summary.episode.trigger === 'manualFaq'
            ? 'Ouverture manuelle de l’aide'
            : summary.episode.trigger === 'tour'
              ? 'Parcours guidé'
              : summary.episode.trigger;
      rows.push(
        `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;"><strong style="color:#e2e8f0;">Ouverture de l’aide</strong> · ${this.escapeHtml(triggerLabel)}</p>`,
      );
      if (typeof summary.episode.frictionAtTrigger === 'number') {
        rows.push(
          `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;"><strong style="color:#e2e8f0;">Niveau de difficulté</strong> · ${Math.round(summary.episode.frictionAtTrigger * 100)}%</p>`,
        );
      }
      if (typeof summary.episode.riskAtTrigger === 'number') {
        rows.push(
          `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;"><strong style="color:#e2e8f0;">Risque d’abandon</strong> · ${Math.round(summary.episode.riskAtTrigger * 100)}%</p>`,
        );
      }
      if (typeof summary.episode.timeOnPageAtTrigger === 'number') {
        rows.push(
          `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;"><strong style="color:#e2e8f0;">Temps passé</strong> · ${summary.episode.timeOnPageAtTrigger}s</p>`,
        );
      }
    }
    if (summary.browser?.trim()) {
      rows.push(
        `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;"><strong style="color:#e2e8f0;">Navigateur</strong> · ${this.escapeHtml(summary.browser.trim())}</p>`,
      );
    }
    if (summary.assistanceState?.trim()) {
      const assistanceLabel =
        summary.assistanceState === 'faq'
          ? 'Aide / FAQ ouverte'
          : summary.assistanceState === 'tour'
            ? 'Parcours guidé en cours'
            : summary.assistanceState === 'proactiveToast'
              ? 'Suggestion d’aide affichée'
              : summary.assistanceState === 'none'
                ? 'Aucune aide ouverte'
                : summary.assistanceState;
      rows.push(
        `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;"><strong style="color:#e2e8f0;">Aide ouverte</strong> · ${this.escapeHtml(assistanceLabel)}</p>`,
      );
    }
    if (typeof summary.faqSearchCount === 'number' && summary.faqSearchCount > 0) {
      rows.push(
        `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;"><strong style="color:#e2e8f0;">Recherches dans l’aide</strong> · ${summary.faqSearchCount}</p>`,
      );
    }
    if (summary.faqLastQuery?.trim()) {
      rows.push(
        `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;"><strong style="color:#e2e8f0;">Dernière recherche</strong> · ${this.escapeHtml(summary.faqLastQuery.trim())}</p>`,
      );
    }
    if (summary.activeTourId?.trim()) {
      rows.push(
        `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;"><strong style="color:#e2e8f0;">Parcours en cours</strong> · ${this.escapeHtml(summary.activeTourId.trim())}</p>`,
      );
    }
    if (summary.lastCompletedTourId?.trim() || summary.lastCompletedTourName?.trim()) {
      const label =
        summary.lastCompletedTourName?.trim() ||
        summary.lastCompletedTourId?.trim() ||
        '';
      rows.push(
        `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;"><strong style="color:#e2e8f0;">Dernier parcours terminé</strong> · ${this.escapeHtml(label)}</p>`,
      );
    }
    const history = Array.isArray(summary.navigationHistory)
      ? summary.navigationHistory.filter((u) => typeof u === 'string' && u.trim()).slice(-5)
      : [];
    if (history.length > 0) {
      const list = history
        .map(
          (u) =>
            `<li style="margin:0 0 4px;word-break:break-all;">${this.escapeHtml(u.trim())}</li>`,
        )
        .join('');
      rows.push(
        `<p style="margin:0 0 6px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Pages consultées récemment</p><ul style="margin:0;padding-left:18px;color:#cbd5e1;font-size:12px;line-height:1.5;">${list}</ul>`,
      );
    }
    if (rows.length === 0) return '';
    return `
      <div style="margin:0 0 22px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;background:rgba(15,23,42,0.4);padding:14px 16px;">
        <p style="margin:0 0 10px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Contexte utilisateur</p>
        ${rows.join('')}
      </div>
    `;
  }

  private shortTicketId(id: string): string {
    return id.replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  private resolveBrandOrDefault(brand?: SupportEmailBrand | null): SupportEmailBrand {
    return brand ?? resolveSupportEmailBrand({});
  }

  private isPublicHttpLogoUrl(url: string | null | undefined): boolean {
    if (!url?.trim()) return false;
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private brandHeaderHtml(brand: SupportEmailBrand, title: string, subtitleHtml: string): string {
    const accentFrom = brand.accentFrom;
    const accentTo = brand.accentTo;
    const supportLabel = this.escapeHtml(brand.supportLabel);
    const monogram = this.escapeHtml(brand.monogram || brand.productName.slice(0, 1).toUpperCase() || 'S');
    const monogramBadge = `
      <div style="display:inline-block;background:linear-gradient(135deg,${accentFrom},${accentTo});border:1px solid rgba(255,255,255,0.22);border-radius:14px;padding:12px 14px;box-shadow:0 0 24px ${accentFrom}46;">
        <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.6px;">${monogram}</span>
      </div>`;
    // Prefer public CDN/logo URLs; localhost favicons break in Gmail → monogram fallback.
    const logo = this.isPublicHttpLogoUrl(brand.logoUrl)
      ? `<img src="${this.escapeHtml(brand.logoUrl!)}" alt="${supportLabel}" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:12px;object-fit:contain;margin:0 auto;border:0;" />`
      : monogramBadge;

    return `
      <div style="height:4px;background:linear-gradient(90deg,${accentFrom},${accentTo});"></div>
      <div style="padding:28px 28px 12px;text-align:center;">
        ${logo}
        <p style="margin:14px 0 0;color:${accentFrom};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">
          ${supportLabel}
        </p>
        <h1 style="margin:10px 0 0;color:#f8fafc;font-size:24px;line-height:1.25;">
          ${this.escapeHtml(title)}
        </h1>
        <p style="margin:10px 0 0;color:#94a3b8;font-size:13px;line-height:1.45;word-break:break-word;">
          ${subtitleHtml}
        </p>
      </div>
    `;
  }

  private brandFooterHtml(brand: SupportEmailBrand, extraLines: string[]): string {
    const year = new Date().getFullYear();
    const product = this.escapeHtml(brand.productName);
    const extras = extraLines.map((line) => `${line}<br/>`).join('');
    return `
      <p style="margin:22px 0 0;color:#64748b;font-size:11px;text-align:center;line-height:1.6;">
        ${product} &copy; ${year}<br/>
        ${extras}
      </p>
    `;
  }

  private supportEmailShell(innerHtml: string): string {
    return `
      <div style="margin:0;padding:24px;background:#050b16;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
        <div style="max-width:600px;margin:0 auto;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.12);background:linear-gradient(165deg,#0b1428,#0a1730 48%,#12102a 100%);box-shadow:0 20px 60px rgba(0,0,0,0.45);">
          ${innerHtml}
        </div>
      </div>
    `;
  }

  async sendSupportTicketCreatedEmail(
    toEmails: string[],
    ticket: {
      id: string;
      subject: string;
      description: string;
      projectKey: string;
      pageUrl?: string | null;
      priority: string;
      contactEmail?: string | null;
      contextSummary?: {
        browser?: string | null;
        faqLastQuery?: string | null;
        faqSearchCount?: number | null;
        navigationHistory?: string[] | null;
        assistanceState?: string | null;
        activeTourId?: string | null;
      } | null;
    },
    brandInput?: SupportEmailBrand | null,
  ): Promise<void> {
    const recipients = [...new Set(toEmails.map((e) => e.trim()).filter(Boolean))];
    if (recipients.length === 0) return;
    if (!this.isMailConfigured()) {
      this.logger.warn('MAIL_USER/MAIL_PASSWORD missing — skip support ticket created email');
      return;
    }

    const brand = this.resolveBrandOrDefault(brandInput);
    const dashboardUrl = `${this.frontendUrl}/dashboard/support`;
    const ticketUrl = `${dashboardUrl}?projectKey=${encodeURIComponent(ticket.projectKey)}`;
    const ref = this.shortTicketId(ticket.id);
    const subjectSafe = this.escapeHtml(ticket.subject);
    const projectSafe = this.escapeHtml(ticket.projectKey);
    const prioritySafe = this.escapeHtml(ticket.priority);
    const excerptHtml = this.formatMultilineHtml(this.truncateText(ticket.description, 500));
    const pageUrlSafe = ticket.pageUrl?.trim()
      ? this.escapeHtml(ticket.pageUrl.trim())
      : null;
    const contactSafe = ticket.contactEmail?.trim()
      ? this.escapeHtml(ticket.contactEmail.trim())
      : null;
    const contextHtml = this.supportTicketContextSummaryHtml(ticket.contextSummary);
    const priorityLabel: Record<string, string> = {
      LOW: 'Basse',
      MEDIUM: 'Moyenne',
      HIGH: 'Haute',
      URGENT: 'Urgente',
    };
    const priorityDisplay = priorityLabel[ticket.priority] || ticket.priority;
    const accentFrom = brand.accentFrom;
    const accentTo = brand.accentTo;

    try {
      await this.transporter.sendMail({
        from: `"${brand.fromDisplayName}" <${this.fromEmail}>`,
        to: recipients.join(', '),
        subject: `Nouveau ticket #${ref} — ${ticket.subject}`,
        html: this.supportEmailShell(`
          ${this.brandHeaderHtml(
            brand,
            'Nouveau ticket reçu',
            `Réf. <strong style="color:#e2e8f0;">#${ref}</strong>
             · priorité <strong style="color:#f8fafc;">${this.escapeHtml(priorityDisplay)}</strong>`,
          )}
          <div style="padding:8px 28px 28px;">
            <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;line-height:1.7;">
              Une nouvelle demande d’aide a été ouverte. Voici le résumé :
            </p>
            <div style="margin:0 0 18px;border:1px solid rgba(255,255,255,0.1);border-radius:14px;background:rgba(15,23,42,0.5);padding:16px 18px;">
              <p style="margin:0 0 6px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Sujet</p>
              <p style="margin:0 0 14px;color:#f8fafc;font-size:16px;font-weight:600;line-height:1.4;">${subjectSafe}</p>
              <p style="margin:0 0 6px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Message utilisateur</p>
              <p style="margin:0;color:#e2e8f0;font-size:14px;line-height:1.7;">${excerptHtml}</p>
            </div>
            <div style="margin:0 0 22px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;background:rgba(15,23,42,0.4);padding:14px 16px;">
              <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;">
                <strong style="color:#e2e8f0;">Projet</strong> · ${projectSafe}
              </p>
              ${
                contactSafe
                  ? `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;">
                       <strong style="color:#e2e8f0;">Contact</strong> ·
                       <a href="mailto:${contactSafe}" style="color:${accentFrom};text-decoration:none;">${contactSafe}</a>
                     </p>`
                  : ''
              }
              ${
                pageUrlSafe
                  ? `<p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;word-break:break-all;">
                       <strong style="color:#e2e8f0;">Page</strong> ·
                       <a href="${pageUrlSafe}" style="color:#93c5fd;text-decoration:underline;">${pageUrlSafe}</a>
                     </p>`
                  : `<p style="margin:0;color:#64748b;font-size:12px;">Priorité technique : ${prioritySafe}</p>`
              }
            </div>
            ${contextHtml}
            <div style="text-align:center;margin:8px 0 20px;">
              <a href="${ticketUrl}" style="display:inline-block;background:linear-gradient(135deg,${accentFrom},${accentTo});color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:12px;font-weight:700;font-size:15px;box-shadow:0 0 22px ${accentFrom}46;">
                Ouvrir dans le dashboard
              </a>
            </div>
            ${this.brandFooterHtml(brand, [
              'Notification automatique — ouvrez le ticket dans le dashboard pour répondre au client.',
              `<span style="color:#475569;">Ticket ${this.escapeHtml(ticket.id)}</span>`,
            ])}
          </div>
        `),
      });
      this.logger.log(`Support ticket created email sent to ${recipients.join(', ')}`);
    } catch (error) {
      this.logger.error('Failed to send support ticket created email', error);
    }
  }

  async sendSupportTicketResolvedEmail(
    toEmail: string,
    ticket: { id?: string; subject: string; projectKey: string },
    brandInput?: SupportEmailBrand | null,
  ): Promise<void> {
    const email = toEmail?.trim();
    if (!email) return;
    if (!this.isMailConfigured()) {
      this.logger.warn('MAIL_USER/MAIL_PASSWORD missing — skip support ticket resolved email');
      return;
    }

    const brand = this.resolveBrandOrDefault(brandInput);
    const projectSafe = this.escapeHtml(ticket.projectKey);
    const ref = ticket.id ? this.shortTicketId(ticket.id) : null;
    const accentFrom = brand.accentFrom;
    const accentTo = brand.accentTo;

    try {
      await this.transporter.sendMail({
        from: `"${brand.fromDisplayName}" <${this.fromEmail}>`,
        to: email,
        subject: `Demande résolue — ${ticket.subject}`,
        html: this.supportEmailShell(`
          ${this.brandHeaderHtml(
            brand,
            'Votre demande a été traitée',
            ref
              ? this.supportRefSubtitleHtml(ref, ticket.subject)
              : `Sujet&nbsp;: <strong style="color:#f8fafc;">${this.escapeHtml(this.truncateText(ticket.subject, 48))}</strong>`,
          )}
          <div style="padding:8px 28px 28px;">
            <div style="margin:0 0 18px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;background:rgba(15,23,42,0.55);padding:14px 16px;">
              ${this.supportSubjectReminderHtml(ticket.subject, false)}
            </div>
            <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.7;">
              Bonjour,<br/><br/>
              Votre demande ci-dessus (projet ${projectSafe}) est marquée comme résolue par
              <strong style="color:#f8fafc;">${this.escapeHtml(brand.supportLabel)}</strong>.
            </p>
            <div style="margin:0 0 18px;border:1px solid ${accentFrom}59;border-radius:14px;background:${accentFrom}14;padding:14px 16px;">
              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
                Si le problème persiste, rouvrez l’aide dans l’application et envoyez un nouveau message
                ${ref ? `en indiquant la référence <strong style="color:#f8fafc;">#${ref}</strong>` : ''}.
              </p>
            </div>
            ${this.brandFooterHtml(brand, [
              'E-mail automatique de clôture de ticket.',
              ticket.id
                ? `<span style="color:#475569;">Ticket ${this.escapeHtml(ticket.id)}</span>`
                : '',
            ].filter(Boolean))}
          </div>
        `),
      });
      this.logger.log(`Support ticket resolved email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send support ticket resolved email to ${email}`, error);
    }
  }

  /**
   * Personalized admin reply. Throws if SMTP is not configured or send fails,
   * so the API can refuse to persist a reply that was never delivered.
   */
  async sendSupportTicketReplyEmail(
    toEmail: string,
    ticket: {
      id: string;
      subject: string;
      projectKey: string;
      replyBody: string;
      originalMessage?: string;
      authorName?: string | null;
      pageUrl?: string | null;
    },
    brandInput?: SupportEmailBrand | null,
  ): Promise<void> {
    const email = toEmail?.trim();
    if (!email) {
      throw new Error('Missing recipient email for support reply');
    }
    if (!this.isMailConfigured()) {
      this.logger.warn('MAIL_USER/MAIL_PASSWORD missing — cannot send support ticket reply');
      throw new Error('SMTP non configuré — impossible d’envoyer la réponse.');
    }

    const brand = this.resolveBrandOrDefault(brandInput);
    const replyHtml = this.formatMultilineHtml(ticket.replyBody.trim());
    const originalExcerpt = ticket.originalMessage
      ? this.formatMultilineHtml(this.truncateText(ticket.originalMessage, 400))
      : null;
    const projectSafe = this.escapeHtml(ticket.projectKey);
    const ref = this.shortTicketId(ticket.id);
    const signer =
      ticket.authorName?.trim() || `L’équipe ${brand.supportLabel}`;
    const signerSafe = this.escapeHtml(signer);
    const pageUrlSafe = ticket.pageUrl?.trim()
      ? this.escapeHtml(ticket.pageUrl.trim())
      : null;
    const accentFrom = brand.accentFrom;
    const accentTo = brand.accentTo;

    await this.transporter.sendMail({
      from: `"${brand.fromDisplayName}" <${this.fromEmail}>`,
      to: email,
      replyTo: this.fromEmail,
      subject: `Réponse à votre demande d’aide — ${ticket.subject}`,
      html: this.supportEmailShell(`
        ${this.brandHeaderHtml(
          brand,
          'Réponse à votre demande',
          this.supportRefSubtitleHtml(ref, ticket.subject),
        )}
        <div style="padding:8px 28px 28px;">
          <p style="margin:0 0 16px;color:#e2e8f0;font-size:15px;line-height:1.7;">Bonjour,</p>
          <p style="margin:0 0 18px;color:#cbd5e1;font-size:15px;line-height:1.7;">
            Merci d’avoir contacté ${this.escapeHtml(brand.supportLabel)}. Voici la réponse de notre équipe :
          </p>
          <div style="margin:0 0 22px;border:1px solid ${accentFrom}59;border-radius:14px;background:${accentFrom}14;padding:16px 18px;">
            <p style="margin:0 0 8px;color:${accentFrom};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
              Message de l’équipe
            </p>
            <p style="margin:0;color:#f8fafc;font-size:15px;line-height:1.75;">${replyHtml}</p>
          </div>
          <p style="margin:0 0 6px;color:#e2e8f0;font-size:14px;line-height:1.6;">
            Cordialement,<br/>
            <strong style="color:#f8fafc;">${signerSafe}</strong><br/>
            <span style="color:#94a3b8;font-size:13px;">${this.escapeHtml(brand.supportLabel)}</span>
          </p>
          <div style="margin:24px 0 0;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;">
            <p style="margin:0 0 10px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
              Rappel de votre demande
            </p>
            <div style="border:1px solid rgba(255,255,255,0.1);border-radius:12px;background:rgba(15,23,42,0.55);padding:14px 16px;">
              ${this.supportSubjectReminderHtml(ticket.subject, Boolean(originalExcerpt))}
              ${
                originalExcerpt
                  ? `
              <p style="margin:0 0 6px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Votre message</p>
              <p style="margin:0;color:#cbd5e1;font-size:13px;line-height:1.6;">${originalExcerpt}</p>`
                  : ''
              }
            </div>
          </div>
          <div style="margin:22px 0 0;border:1px solid rgba(255,255,255,0.1);border-radius:12px;background:rgba(15,23,42,0.45);padding:14px 16px;">
            <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;">
              <strong style="color:#e2e8f0;">Projet</strong> · ${projectSafe}
            </p>
            ${
              pageUrlSafe
                ? `<p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5;word-break:break-all;">
                     <strong style="color:#e2e8f0;">Page</strong> · ${pageUrlSafe}
                   </p>`
                : ''
            }
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              Si le problème persiste, rouvrez l’aide dans l’application et envoyez un nouveau message en indiquant la référence <strong style="color:#f8fafc;">#${ref}</strong>.
            </p>
          </div>
          ${this.brandFooterHtml(brand, [
            'Réponse automatique du support suite à votre demande d’assistance.',
            `<span style="color:#475569;">Ticket ${this.escapeHtml(ticket.id)}</span>`,
          ])}
        </div>
      `),
    });
    this.logger.log(`Support ticket reply email sent to ${email}`);
  }
}
