"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestAppFactory = void 0;
const typeorm_1 = require("typeorm");
class TestAppFactory {
    static async init(app) {
        try {
            const dataSource = app.get(typeorm_1.DataSource);
            if (!dataSource.isInitialized) {
                await dataSource.initialize();
            }
            await dataSource.synchronize();
            return { success: true, dataSource };
        }
        catch (error) {
            console.error('Failed to initialize test database:', error?.message || error);
            throw error;
        }
    }
    static async cleanup(dataSource) {
        if (dataSource && dataSource.isInitialized) {
            try {
                const tables = ['organization_users', 'users', 'organizations'];
                for (const table of tables) {
                    await dataSource.query(`DELETE FROM "${table}"`).catch(() => { });
                }
            }
            catch (error) {
                console.log('Cleanup error (non-critical):', error?.message || error);
            }
        }
    }
}
exports.TestAppFactory = TestAppFactory;
//# sourceMappingURL=test-app.factory.js.map