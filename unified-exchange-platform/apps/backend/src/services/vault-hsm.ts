/// Vault HSM Integration - Hardware Security Module Support
import * as Vault from 'node-vault';
import { logger } from '../utils/logger.js';

export class VaultHSMService {
    private vaultClient: any;
    private hsmProvider: 'AWS_CLOUDHSM' | 'YUBI_HSM' | 'THALES' | 'NONE' = 'NONE';

    async initializeHSM() {
        try {
            // Initialize Vault with AppRole authentication
            this.vaultClient = new Vault({
                endpoint: process.env.VAULT_ADDR || 'http://localhost:8200',
                auth: {
                    method: 'appRole',
                    roleId: process.env.VAULT_ROLE_ID,
                    secretId: process.env.VAULT_SECRET_ID,
                },
            });

            // Test connection
            const health = await this.vaultClient.health();
            logger.info('Vault connected (HSM-enabled):', health);

            // Detect HSM provider
            this.hsmProvider = (process.env.HSM_PROVIDER as any) || 'NONE';

            if (this.hsmProvider !== 'NONE') {
                await this.enableHSMBackend();
            }
        } catch (error) {
            logger.error('Vault HSM initialization failed:', error);
            throw error;
        }
    }

    private async enableHSMBackend() {
        try {
            if (this.hsmProvider === 'AWS_CLOUDHSM') {
                // Configure AWS CloudHSM
                const config = {
                    hsm_ip_address: process.env.HSM_CLUSTER_IP,
                    hsm_username: process.env.HSM_USERNAME,
                    hsm_password: process.env.HSM_PASSWORD,
                    library_path: '/opt/cloudhsm/lib/libcloudhsm_pkcs11.so',
                };

                await this.vaultClient.request({
                    path: 'sys/config/seal/awskms',
                    method: 'POST',
                    json: { ...config },
                });

                logger.info('AWS CloudHSM backend enabled');
            } else if (this.hsmProvider === 'YUBI_HSM') {
                // Configure YubiHSM2
                const config = {
                    connector_url: process.env.YUBI_CONNECTOR_URL,
                    auth_key_id: process.env.YUBI_AUTH_KEY_ID,
                };

                await this.vaultClient.request({
                    path: 'sys/config/seal/yubihsm',
                    method: 'POST',
                    json: { ...config },
                });

                logger.info('YubiHSM2 backend enabled');
            }
        } catch (error) {
            logger.error('Failed to enable HSM backend:', error);
            throw error;
        }
    }

    /// Store secret in HSM-backed storage
    async storeSecureSecret(path: string, data: Record<string, string>): Promise<void> {
        try {
            await this.vaultClient.write(`secret/data/${path}`, { data });
            logger.info(`Secret stored in HSM: ${path}`);
        } catch (error) {
            logger.error(`Failed to store secret in HSM: ${path}`, error);
            throw error;
        }
    }

    /// Retrieve secret from HSM-backed storage
    async retrieveSecureSecret(path: string): Promise<Record<string, string>> {
        try {
            const secret = await this.vaultClient.read(`secret/data/${path}`);
            return secret.data.data;
        } catch (error) {
            logger.error(`Failed to retrieve secret from HSM: ${path}`, error);
            throw error;
        }
    }

    /// Enable automatic secret rotation
    async enableSecretRotation(path: string, rotationInterval: string = '30d'): Promise<void> {
        try {
            await this.vaultClient.write(`auth/approle/role/rotation-policy`, {
                rotation_period: rotationInterval,
                path,
            });

            logger.info(`Secret rotation enabled for ${path}: every ${rotationInterval}`);
        } catch (error) {
            logger.error('Failed to enable secret rotation:', error);
            throw error;
        }
    }

    /// Generate HSM-backed encryption key
    async generateHSMKey(keyName: string, keyType: 'RSA' | 'ECDSA' = 'ECDSA'): Promise<string> {
        try {
            const response = await this.vaultClient.write(`transit/keys/${keyName}`, {
                type: keyType,
                exportable: false, // Cannot be exported from HSM
            });

            logger.info(`HSM key generated: ${keyName} (${keyType})`);
            return response.id;
        } catch (error) {
            logger.error(`Failed to generate HSM key: ${keyName}`, error);
            throw error;
        }
    }

    /// Sign data with HSM key
    async signWithHSMKey(keyName: string, data: string): Promise<string> {
        try {
            const response = await this.vaultClient.write(
                `transit/sign/${keyName}`,
                { input: Buffer.from(data).toString('base64') }
            );

            return response.data.signature;
        } catch (error) {
            logger.error(`Failed to sign with HSM key: ${keyName}`, error);
            throw error;
        }
    }

    /// Verify signature using HSM key
    async verifyWithHSMKey(
        keyName: string,
        data: string,
        signature: string
    ): Promise<boolean> {
        try {
            const response = await this.vaultClient.write(
                `transit/verify/${keyName}`,
                {
                    input: Buffer.from(data).toString('base64'),
                    signature,
                }
            );

            return response.data.valid;
        } catch (error) {
            logger.error(`Failed to verify with HSM key: ${keyName}`, error);
            throw error;
        }
    }

    /// Encrypt data using HSM
    async encryptWithHSM(keyName: string, plaintext: string): Promise<string> {
        try {
            const response = await this.vaultClient.write(
                `transit/encrypt/${keyName}`,
                { plaintext: Buffer.from(plaintext).toString('base64') }
            );

            return response.data.ciphertext;
        } catch (error) {
            logger.error(`Failed to encrypt with HSM: ${keyName}`, error);
            throw error;
        }
    }

    /// Decrypt data using HSM
    async decryptWithHSM(keyName: string, ciphertext: string): Promise<string> {
        try {
            const response = await this.vaultClient.write(
                `transit/decrypt/${keyName}`,
                { ciphertext }
            );

            return Buffer.from(response.data.plaintext, 'base64').toString();
        } catch (error) {
            logger.error(`Failed to decrypt with HSM: ${keyName}`, error);
            throw error;
        }
    }

    /// Create HSM-backed certificate
    async createHSMCertificate(
        commonName: string,
        ttl: string = '8760h'
    ): Promise<{ cert: string; key: string; ca: string }> {
        try {
            const response = await this.vaultClient.write(
                'pki/issue/kk99-issuer',
                {
                    common_name: commonName,
                    ttl,
                    private_key_format: 'pkcs8',
                }
            );

            return {
                cert: response.data.certificate,
                key: response.data.private_key,
                ca: response.data.issuing_ca,
            };
        } catch (error) {
            logger.error(`Failed to create HSM certificate: ${commonName}`, error);
            throw error;
        }
    }

    /// Get HSM audit log
    async getHSMAuditLog(limit: number = 100): Promise<any[]> {
        try {
            const response = await this.vaultClient.request({
                path: 'sys/audit',
                method: 'LIST',
            });

            logger.info(`Retrieved HSM audit log (${limit} entries)`);
            return response.data.audit;
        } catch (error) {
            logger.error('Failed to retrieve HSM audit log:', error);
            throw error;
        }
    }

    /// Seal/Unseal Vault (HSM-backed)
    async sealVault(): Promise<void> {
        try {
            await this.vaultClient.request({
                path: 'sys/seal',
                method: 'POST',
            });

            logger.info('Vault sealed (HSM auto-unseal may be active)');
        } catch (error) {
            logger.error('Failed to seal Vault:', error);
            throw error;
        }
    }

    /// Check HSM health
    async checkHSMHealth(): Promise<any> {
        try {
            const health = await this.vaultClient.health();

            return {
                sealed: health.sealed,
                standby: health.standby,
                version: health.version,
                hsm_provider: this.hsmProvider,
                hsm_healthy: !health.sealed,
            };
        } catch (error) {
            logger.error('Failed to check HSM health:', error);
            throw error;
        }
    }

    /// Get HSM status and metrics
    async getHSMStatus(): Promise<any> {
        try {
            const metrics = await this.vaultClient.request({
                path: 'sys/metrics',
                method: 'GET',
            });

            return {
                hsm_provider: this.hsmProvider,
                operations_total: metrics.data.counters?.operations || 0,
                errors_total: metrics.data.counters?.errors || 0,
                latency_ms: metrics.data.gauges?.operation_latency || 0,
                timestamp: new Date(),
            };
        } catch (error) {
            logger.error('Failed to get HSM status:', error);
            throw error;
        }
    }
}

export const vaultHSMService = new VaultHSMService();
