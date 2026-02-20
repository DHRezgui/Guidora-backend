import { INestApplication } from '@nestjs/common';
export declare class AuthHelper {
    private app;
    private authService;
    private userService;
    constructor(app: INestApplication);
    loginAsAdmin(): Promise<{
        token: string;
        user: import("../../src/user/types/user-response.type").UserResponse;
    }>;
    loginAsDeveloper(): Promise<{
        token: string;
        user: import("../../src/user/types/user-response.type").UserResponse;
    }>;
    loginAsUser(): Promise<{
        token: string;
        user: import("../../src/user/types/user-response.type").UserResponse;
    }>;
}
