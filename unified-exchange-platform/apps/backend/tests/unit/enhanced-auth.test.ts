// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedAuthService } from '../../src/services/enhanced-auth';

describe('EnhancedAuthService', () => {
  let service: EnhancedAuthService;

  beforeEach(() => {
    service = new EnhancedAuthService();
  });

  describe('setup2FA', () => {
    it('should generate TOTP secret and QR code', async () => {
      const result = await service.setup2FA({
        userId: 'user-1',
        email: 'test@example.com',
      });

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCode');
      expect(result).toHaveProperty('backupCodes');
      expect(result.secret).toMatch(/^[A-Z0-9]{32}$/);
      expect(result.backupCodes).toHaveLength(10);
    });
  });

  describe('verify2FASetup', () => {
    it('should verify correct TOTP token', async () => {
      const setup = await service.setup2FA({
        userId: 'user-1',
        email: 'test@example.com',
      });

      // Mock TOTP generation
      const mockToken = '123456';
      vi.spyOn(service as any, 'generateTOTP').mockReturnValue(mockToken);

      const verified = await service.verify2FASetup({
        userId: 'user-1',
        secret: setup.secret,
        token: mockToken,
      });

      expect(verified).toBe(true);
    });

    it('should reject incorrect TOTP token', async () => {
      const setup = await service.setup2FA({
        userId: 'user-2',
        email: 'test2@example.com',
      });

      const verified = await service.verify2FASetup({
        userId: 'user-2',
        secret: setup.secret,
        token: '000000',
      });

      expect(verified).toBe(false);
    });
  });

  describe('verifyTOTP', () => {
    it('should verify valid TOTP token', async () => {
      const mockSecret = 'JBSWY3DPEHPK3PXP';
      
      vi.spyOn(service as any, 'generateTOTP').mockReturnValue('123456');

      const verified = await service.verifyTOTP({
        userId: 'user-1',
        token: '123456',
      });

      expect(verified).toBe(true);
    });
  });

  describe('registerWebAuthn', () => {
    it('should register WebAuthn credential', async () => {
      const result = await service.registerWebAuthn({
        userId: 'user-1',
        credentialId: 'cred-123',
        publicKey: 'public-key-data',
        deviceName: 'YubiKey 5',
      });

      expect(result.success).toBe(true);
      expect(result.credentialId).toBe('cred-123');
    });
  });

  describe('isIpWhitelisted', () => {
    it('should check if IP is whitelisted', async () => {
      await service.addIpToWhitelist({
        userId: 'user-1',
        ipAddress: '192.168.1.1',
      });

      const isWhitelisted = await service.isIpWhitelisted({
        userId: 'user-1',
        ipAddress: '192.168.1.1',
      });

      expect(isWhitelisted).toBe(true);
    });

    it('should reject non-whitelisted IP', async () => {
      const isWhitelisted = await service.isIpWhitelisted({
        userId: 'user-2',
        ipAddress: '10.0.0.1',
      });

      expect(isWhitelisted).toBe(false);
    });
  });

  describe('recordLoginAttempt', () => {
    it('should track failed login attempts', async () => {
      for (let i = 0; i < 3; i++) {
        await service.recordLoginAttempt({
          userId: 'user-1',
          success: false,
          ipAddress: '1.2.3.4',
        });
      }

      const attempts = await service.getLoginAttempts('user-1');
      expect(attempts.failedCount).toBe(3);
    });

    it('should lock account after 5 failed attempts', async () => {
      for (let i = 0; i < 6; i++) {
        await service.recordLoginAttempt({
          userId: 'user-locked',
          success: false,
          ipAddress: '1.2.3.4',
        });
      }

      const isLocked = await service.isAccountLocked('user-locked');
      expect(isLocked).toBe(true);
    });
  });
});
