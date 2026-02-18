import { INestApplication } from '@nestjs/common';
import { AuthService } from './../../src/auth/auth.service';
import { UserService } from './../../src/user/user.service';
import { UserRole } from './../../src/user/entities/user.entity';

export class AuthHelper {
  private authService: AuthService;
  private userService: UserService;

  constructor(private app: INestApplication) {
    this.authService = app.get(AuthService);
    this.userService = app.get(UserService);
  }

  async loginAsAdmin() {
    const user = await this.userService.create({
      email: `admin-${Date.now()}@test.com`,
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'Test',
      role: UserRole.ADMIN,
      isActive: true,
    });

    const { access_token } = await this.authService.login({
      email: user.email,
      password: 'AdminPass123!',
    });

    return { token: access_token, user };

  }

  async loginAsDeveloper() {
    const user = await this.userService.create({
      email: `dev-${Date.now()}@test.com`,
      password: 'DevPass123!',
      firstName: 'Developer',
      lastName: 'Test',
      role: UserRole.DEVELOPER,
      isActive: true,
    });

    const { access_token } = await this.authService.login({
      email: user.email,
      password: 'DevPass123!',
    });

    return { token: access_token, user };
  }

  async loginAsUser() {
    const user = await this.userService.create({
      email: `user-${Date.now()}@test.com`,
      password: 'UserPass123!',
      firstName: 'Regular',
      lastName: 'User',
      role: UserRole.USER,
      isActive: true,
    });

    const { access_token } = await this.authService.login({
      email: user.email,
      password: 'UserPass123!',
    });

    return { token: access_token, user };
  }
}