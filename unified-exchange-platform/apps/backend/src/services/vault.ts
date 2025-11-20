import * as Vault from 'node-vault';
import { logger } from '../utils/logger.js';

let vaultClient;

export async function initVault() {
  try {
    vaultClient = new Vault({
      endpoint: process.env.VAULT_ADDR || 'http://localhost:8200',
      token: process.env.VAULT_TOKEN || 'root',
    });

    // Test connection
    const health = await vaultClient.health();
    logger.info('Vault connected:', health);
  } catch (error) {
    logger.error('Vault initialization failed:', error);
    throw error;
  }
}

export async function getSecret(path) {
  try {
    const secret = await vaultClient.read(`secret/data/${path}`);
    return secret.data.data;
  } catch (error) {
    logger.error(`Failed to read secret ${path}:`, error);
    throw error;
  }
}

export async function setSecret(path, data) {
  try {
    await vaultClient.write(`secret/data/${path}`, { data });
    logger.info(`Secret written to ${path}`);
  } catch (error) {
    logger.error(`Failed to write secret ${path}:`, error);
    throw error;
  }
}

export async function getWalletAddresses() {
  try {
    const wallets = await getSecret('wallets');
    return {
      eth: wallets.eth_address,
      sol: wallets.sol_address,
      trx: wallets.trx_address,
      btc: wallets.btc_address,
    };
  } catch (error) {
    logger.error('Failed to get wallet addresses:', error);
    throw error;
  }
}
