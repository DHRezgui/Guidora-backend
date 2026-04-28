import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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
}
