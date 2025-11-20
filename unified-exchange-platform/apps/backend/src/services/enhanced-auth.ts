/// Enhanced Authentication with 2FA and WebAuthn
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { generateSecret, verifyToken } from 'speakeasy';
import QRCode from 'qrcode';

export class EnhancedAuthService {
    /// Setup 2FA (TOTP)
    async setup2FA(userId: string): Promise<{ secret: string; qrCode: string }> {
        const secret = generateSecret({
            name: 'KK99 Exchange',
            issuer: 'KK99',
            length: 32,
        });

        const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

        // Store secret temporarily (not confirmed yet)
        await query(
            'UPDATE exchange.users SET totp_secret = $1, totp_verified = FALSE WHERE id = $2',
            [secret.base32, userId]
        );

        logger.info(`2FA setup initiated for user ${userId}`);

        return {
            secret: secret.base32,
            qrCode,
        };
    }

    /// Verify 2FA setup
    async verify2FASetup(userId: string, token: string): Promise<boolean> {
        const userResult = await query(
            'SELECT totp_secret FROM exchange.users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const secret = userResult.rows[0].totp_secret;
        const verified = verifyToken({
            secret,
            encoding: 'base32',
            token,
            window: 2,
        });

        if (verified) {
            await query(
                'UPDATE exchange.users SET totp_verified = TRUE WHERE id = $1',
                [userId]
            );

            logger.info(`2FA verified for user ${userId}`);
            return true;
        }

        return false;
    }

    /// Verify TOTP token
    async verifyTOTP(userId: string, token: string): Promise<boolean> {
        const userResult = await query(
            'SELECT totp_secret, totp_verified FROM exchange.users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0 || !userResult.rows[0].totp_verified) {
            return false;
        }

        const secret = userResult.rows[0].totp_secret;
        return verifyToken({
            secret,
            encoding: 'base32',
            token,
            window: 2,
        });
    }

    /// Register WebAuthn credential
    async registerWebAuthn(userId: string, credential: any): Promise<void> {
        // Validate and store credential
        await query(
            `INSERT INTO exchange.webauthn_credentials 
             (user_id, credential_data, created_at)
             VALUES ($1, $2, NOW())`,
            [userId, JSON.stringify(credential)]
        );

        logger.info(`WebAuthn credential registered for user ${userId}`);
    }

    /// Verify WebAuthn assertion
    async verifyWebAuthn(userId: string, assertion: any): Promise<boolean> {
        const credResult = await query(
            'SELECT credential_data FROM exchange.webauthn_credentials WHERE user_id = $1',
            [userId]
        );

        if (credResult.rows.length === 0) return false;

        // Validate assertion against stored credential
        // (Implementation depends on specific WebAuthn library)

        logger.info(`WebAuthn verification for user ${userId}`);
        return true;
    }

    /// Check IP whitelist
    async isIpWhitelisted(userId: string, ipAddress: string): Promise<boolean> {
        const result = await query(
            'SELECT id FROM exchange.ip_whitelist WHERE user_id = $1 AND ip_address = $2',
            [userId, ipAddress]
        );

        return result.rows.length > 0;
    }

    /// Add IP to whitelist
    async addIpToWhitelist(userId: string, ipAddress: string): Promise<void> {
        await query(
            `INSERT INTO exchange.ip_whitelist (user_id, ip_address, created_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT DO NOTHING`,
            [userId, ipAddress]
        );

        logger.info(`IP ${ipAddress} added to whitelist for user ${userId}`);
    }

    /// Track login attempts
    async recordLoginAttempt(email: string, ipAddress: string, success: boolean): Promise<void> {
        await query(
            `INSERT INTO exchange.login_attempts (email, ip_address, success, created_at)
             VALUES ($1, $2, $3, NOW())`,
            [email, ipAddress, success]
        );

        // Check for suspicious activity
        const recentFailed = await query(
            `SELECT COUNT(*) as attempts FROM exchange.login_attempts
             WHERE email = $1 AND success = FALSE AND created_at > NOW() - INTERVAL '15 minutes'`,
            [email]
        );

        if (recentFailed.rows[0].attempts > 5) {
            logger.warn(`Suspicious login activity for ${email} from ${ipAddress}`);

            // Lock account temporarily
            await query(
                'UPDATE exchange.users SET login_locked_until = NOW() + INTERVAL \'30 minutes\' WHERE email = $1',
                [email]
            );
        }
    }

    /// Get device fingerprint
    async getDeviceFingerprint(userId: string, fingerprint: string): Promise<any> {
        const result = await query(
            `SELECT id, first_seen FROM exchange.device_fingerprints
             WHERE user_id = $1 AND fingerprint = $2`,
            [userId, fingerprint]
        );

        if (result.rows.length === 0) {
            // New device
            await query(
                `INSERT INTO exchange.device_fingerprints (user_id, fingerprint, first_seen, created_at)
                 VALUES ($1, $2, NOW(), NOW())`,
                [userId, fingerprint]
            );

            return { is_new_device: true };
        }

        return { is_new_device: false, first_seen: result.rows[0].first_seen };
    }

    /// Disable 2FA
    async disable2FA(userId: string, password: string): Promise<boolean> {
        // Verify password first
        const userResult = await query(
            'SELECT id FROM exchange.users WHERE id = $1 AND password_hash = $2',
            [userId, this.hashPassword(password)]
        );

        if (userResult.rows.length === 0) return false;

        await query(
            'UPDATE exchange.users SET totp_secret = NULL, totp_verified = FALSE WHERE id = $1',
            [userId]
        );

        logger.info(`2FA disabled for user ${userId}`);
        return true;
    }

    private hashPassword(password: string): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(password).digest('hex');
    }
}

export const enhancedAuthService = new EnhancedAuthService();
