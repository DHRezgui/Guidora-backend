"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthHelper = void 0;
const auth_service_1 = require("./../../src/auth/auth.service");
const user_service_1 = require("./../../src/user/user.service");
const user_entity_1 = require("./../../src/user/entities/user.entity");
class AuthHelper {
    app;
    authService;
    userService;
    constructor(app) {
        this.app = app;
        this.authService = app.get(auth_service_1.AuthService);
        this.userService = app.get(user_service_1.UserService);
    }
    async loginAsAdmin() {
        const user = await this.userService.create({
            email: `admin-${Date.now()}@test.com`,
            password: 'AdminPass123!',
            firstName: 'Admin',
            lastName: 'Test',
            role: user_entity_1.UserRole.ADMIN,
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
            role: user_entity_1.UserRole.DEVELOPER,
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
            role: user_entity_1.UserRole.USER,
            isActive: true,
        });
        const { access_token } = await this.authService.login({
            email: user.email,
            password: 'UserPass123!',
        });
        return { token: access_token, user };
    }
}
exports.AuthHelper = AuthHelper;
//# sourceMappingURL=auth.helper.js.map