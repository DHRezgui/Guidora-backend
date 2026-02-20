import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
export declare class TestAppFactory {
    static init(app: INestApplication): Promise<{
        success: boolean;
        dataSource: DataSource;
    }>;
    static cleanup(dataSource: DataSource): Promise<void>;
}
