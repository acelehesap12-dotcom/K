import { ethers } from 'ethers';
import axios from 'axios';
import { logger } from '../utils/logger.js';
import { publishEvent } from './kafka.js';

export async function verifyDeposit(chain, transactionHash) {
  try {
    let verified = false;
    let amount = 0;

    switch (chain.toUpperCase()) {
      case 'ETH':
        verified = await verifyEthereumDeposit(transactionHash);
        break;
      case 'SOL':
        verified = await verifySolanaDeposit(transactionHash);
        break;
      case 'TRX':
        verified = await verifyTronDeposit(transactionHash);
        break;
      case 'BTC':
        verified = await verifyBitcoinDeposit(transactionHash);
        break;
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }

    return verified;
  } catch (error) {
    logger.error(`Deposit verification failed for ${chain}:`, error);
    throw error;
  }
}

async function verifyEthereumDeposit(txHash) {
  try {
    const provider = new ethers.JsonRpcProvider(
      process.env.ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/'
    );

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return false;

    // Check if transaction is confirmed
    const confirmations = await provider.getBlockNumber() - receipt.blockNumber;
    return confirmations >= 12; // 12 confirmations for security
  } catch (error) {
    logger.error('Ethereum deposit verification error:', error);
    throw error;
  }
}

async function verifySolanaDeposit(txHash) {
  try {
    const response = await axios.post(
      process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com',
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatus',
        params: [[txHash]],
      }
    );

    const status = response.data.result.value?.[0];
    return status?.confirmationStatus === 'finalized';
  } catch (error) {
    logger.error('Solana deposit verification error:', error);
    throw error;
  }
}

async function verifyTronDeposit(txHash) {
  try {
    const response = await axios.get(
      `${process.env.TRON_RPC_URL}/wallet/gettransactionbyid`,
      { params: { value: txHash } }
    );

    return response.data.blockNumber > 0;
  } catch (error) {
    logger.error('TRON deposit verification error:', error);
    throw error;
  }
}

async function verifyBitcoinDeposit(txHash) {
  try {
    const response = await axios.get(
      `https://mempool.space/api/tx/${txHash}`
    );

    return response.data.status?.confirmed === true;
  } catch (error) {
    logger.error('Bitcoin deposit verification error:', error);
    throw error;
  }
}

export async function calculateKK99Amount(depositAmount, chain) {
  const DEPOSIT_FEE_PERCENT = parseFloat(process.env.FEE_WITHDRAWAL_PERCENT || '0.5');
  const fee = depositAmount * (DEPOSIT_FEE_PERCENT / 100);
  const kk99Amount = depositAmount - fee;
  
  return {
    gross: depositAmount,
    fee,
    net: kk99Amount,
  };
}

export async function publishDepositEvent(depositData) {
  try {
    await publishEvent('deposit-events', depositData.userId, {
      depositId: depositData.id,
      userId: depositData.userId,
      chain: depositData.chain,
      transactionHash: depositData.transactionHash,
      amount: depositData.amount,
      kk99Amount: depositData.kk99Amount,
      status: depositData.status,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to publish deposit event:', error);
    throw error;
  }
}
