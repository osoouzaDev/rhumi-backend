const testEnvironment = {
    NODE_ENV: "test",
    DB_HOST: "127.0.0.1",
    DB_PORT: "5432",
    DB_USER: "rhumi_test",
    DB_PASSWORD: "rhumi-test-database-password",
    DB_NAME: "rhumi_test",
    DB_SSL: "false",
    JWT_SECRET: "rhumi-automated-tests-only-jwt-secret-2026",
    JWT_ISSUER: "rhumi-tests",
    JWT_AUDIENCE: "rhumi-tests-client",
};

for (const [name, value] of Object.entries(testEnvironment)) {
    if (!process.env[name]) {
        process.env[name] = value;
    }
}
