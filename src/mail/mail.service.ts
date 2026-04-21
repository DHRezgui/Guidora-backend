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
        from: `"TrustDev Onboarding" <${this.fromEmail}>`,
        to: email,
        subject: 'Réinitialisation de votre mot de passe - TrustDev',
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed, #9333ea); border-radius: 16px; padding: 14px; margin-bottom: 16px;">
                <span style="color: white; font-size: 24px; font-weight: bold;">TD</span>
              </div>
              <h1 style="color: #1e1b4b; font-size: 22px; margin: 0;">Réinitialisation du mot de passe</h1>
            </div>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">
              Bonjour <strong>${name}</strong>,
            </p>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">
              Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-weight: 600; font-size: 15px;">
                Réinitialiser mon mot de passe
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
              Ce lien est valable pendant <strong>1 heure</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #cbd5e1; font-size: 12px; text-align: center;">
              TrustDev Onboarding &copy; ${new Date().getFullYear()}
            </p>
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
        from: `"TrustDev Onboarding" <${this.fromEmail}>`,
        to: email,
        subject: 'Vérifiez votre adresse email - TrustDev',
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed, #9333ea); border-radius: 16px; padding: 14px; margin-bottom: 16px;">
                <span style="color: white; font-size: 24px; font-weight: bold;">TD</span>
              </div>
              <h1 style="color: #1e1b4b; font-size: 22px; margin: 0;">Vérification de votre email</h1>
            </div>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">
              Bonjour <strong>${name}</strong>,
            </p>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">
              Merci de votre inscription ! Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse email :
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-weight: 600; font-size: 15px;">
                Vérifier mon email
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
              Ce lien est valable pendant <strong>24 heures</strong>. Si vous n'avez pas créé de compte, ignorez cet email.
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #cbd5e1; font-size: 12px; text-align: center;">
              TrustDev Onboarding &copy; ${new Date().getFullYear()}
            </p>
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
