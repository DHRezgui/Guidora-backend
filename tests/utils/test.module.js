"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const user_module_1 = require("./../../src/user/user.module");
const organization_module_1 = require("./../../src/organization/organization.module");
const auth_module_1 = require("./../../src/auth/auth.module");
const core_1 = require("@nestjs/core");
const jwt_auth_guard_1 = require("./../../src/auth/guards/jwt-auth.guard");
const roles_guard_1 = require("./../../src/auth/guards/roles.guard");
let TestModule = class TestModule {
};
exports.TestModule = TestModule;
exports.TestModule = TestModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env.test',
            }),
            typeorm_1.TypeOrmModule.forRoot({
                type: 'postgres',
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432', 10),
                username: process.env.DB_USER || 'dhia',
                password: process.env.DB_PASSWORD || 'dhiadhia12',
                database: process.env.DB_NAME || 'onboarding',
                entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
                synchronize: true,
                dropSchema: false,
                logging: false,
                uuidExtension: 'pgcrypto',
            }),
            user_module_1.UserModule,
            organization_module_1.OrganizationModule,
            auth_module_1.AuthModule,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: roles_guard_1.RolesGuard,
            },
        ],
    })
], TestModule);
//# sourceMappingURL=test.module.js.map