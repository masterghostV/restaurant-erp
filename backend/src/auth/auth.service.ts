import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { LoginDto, SignupOwnerDto, VerifyOtpDto, ResendOtpDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';

const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  private generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Only restaurant owners can self-sign-up. This creates an unverified
   * account with an OWNER role and emails a 6-digit OTP; the account can't
   * log in until verifyOtp() succeeds. No restaurant is attached yet — the
   * owner creates their restaurant afterward (RestaurantService.createMyRestaurant).
   */
  async signupOwner(dto: SignupOwnerDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      if (existing.isVerified) {
        throw new BadRequestException('An account with this email already exists. Please log in.');
      }
      // Account exists but was never verified (e.g. from a previous signup where email timed out)
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      const otp = this.generateOtp();
      const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          name: dto.name,
          password: hashedPassword,
          otpCode: otp,
          otpExpiry,
          otpAttempts: 0,
        },
      });

      await this.mailService.sendOtp(dto.email, otp);

      return {
        message: 'Account created. A verification code has been sent to your email.',
        email: dto.email,
      };
    }

    let ownerRole = await this.prisma.role.findUnique({ where: { name: 'OWNER' } });
    if (!ownerRole) {
      ownerRole = await this.prisma.role.create({ data: { name: 'OWNER', description: 'Restaurant owner/admin' } });
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const otp = this.generateOtp();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        roleId: ownerRole.id,
        isVerified: false,
        otpCode: otp,
        otpExpiry,
        otpAttempts: 0,
      },
    });

    await this.mailService.sendOtp(dto.email, otp);

    return {
      message: 'Account created. A verification code has been sent to your email.',
      email: dto.email,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new BadRequestException('No pending signup found for this email');
    }
    if (user.isVerified) {
      throw new BadRequestException('This account is already verified. Please log in.');
    }
    if (!user.otpCode || !user.otpExpiry || user.otpExpiry < new Date()) {
      throw new BadRequestException('This code has expired. Please request a new one.');
    }
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect attempts. Please request a new code.');
    }
    if (user.otpCode !== dto.otp) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect verification code');
    }

    const verifiedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        otpCode: null,
        otpExpiry: null,
        otpAttempts: 0,
      },
      include: { role: true, staff: { include: { restaurant: true } } },
    });

    return this.generateToken(verifiedUser);
  }

  async resendOtp(dto: ResendOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Same response either way — avoids leaking which emails are registered.
    const generic = { message: 'If a pending signup exists for this email, a new code has been sent.' };
    if (!user || user.isVerified) return generic;

    const otp = this.generateOtp();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otp, otpExpiry, otpAttempts: 0 },
    });

    await this.mailService.sendOtp(dto.email, otp);
    return generic;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
        staff: {
          include: { restaurant: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.staff?.restaurant?.status === 'SUSPENDED') {
      throw new UnauthorizedException('This restaurant\'s access has been suspended. Contact support.');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email with the OTP sent to you before logging in.');
    }

    return this.generateToken(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always return the same response whether or not the email exists —
    // otherwise this endpoint becomes a way to check which emails are
    // registered in the system.
    const genericResponse = {
      message: 'If an account with that email exists, a reset link has been generated.',
    };

    if (!user) return genericResponse;

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    // NOTE: There's no email/SMS provider configured in this project, so
    // the reset link can't actually be delivered anywhere yet. The token
    // is returned directly in the response below ONLY so this flow is
    // usable/testable during development. Before using this in
    // production, wire this up to a real email provider (e.g. SendGrid,
    // Postmark, AWS SES) and remove `resetToken` from the response —
    // returning it here would otherwise let anyone reset anyone's
    // password just by knowing their email.
    return {
      ...genericResponse,
      devOnlyResetToken: token,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: dto.token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return { message: 'Password reset successfully. You can now log in with your new password.' };
  }

  private generateToken(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      restaurantId: user.staff?.restaurantId || null,
      staffId: user.staff?.id || null,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name,
        restaurantId: user.staff?.restaurantId || null,
        staffId: user.staff?.id || null,
      },
    };
  }
}
