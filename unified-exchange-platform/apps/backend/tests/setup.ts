import { beforeAll, afterAll, afterEach } from 'vitest';

// Setup test environment
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.VAULT_ADDR = 'http://localhost:8200';
  process.env.VAULT_TOKEN = 'test-token';
});

afterEach(() => {
  // Clear mocks after each test
  vi.clearAllMocks();
});

afterAll(async () => {
  // Cleanup after all tests
});
