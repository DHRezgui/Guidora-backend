import { INestApplication } from '@nestjs/common';
export declare class TestDataFactory {
    private app;
    private userService;
    private organizationService;
    private dataSource;
    constructor(app: INestApplication);
    createUser(data?: Partial<any>): Promise<any>;
    createOrganization(data?: Partial<any>): Promise<any>;
    cleanup(): Promise<void>;
}
