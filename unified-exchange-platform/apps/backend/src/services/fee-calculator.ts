/// Fee Tier Calculator - Dynamic fee structure based on volume & holdings
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

interface FeeStructure {
    tier: string;
    maker_fee: number;
    taker_fee: number;
    discount_percent: number;
    requirements: {
        min_volume: number;
        min_kk99_stake: number;
    };
}

export class FeeCalculator {
    private feeTiers: FeeStructure[] = [
        {
            tier: 'BRONZE',
            maker_fee: 0.05,
            taker_fee: 0.10,
            discount_percent: 0,
            requirements: { min_volume: 0, min_kk99_stake: 0 },
        },
        {
            tier: 'SILVER',
            maker_fee: 0.035,
            taker_fee: 0.075,
            discount_percent: 30,
            requirements: { min_volume: 100000, min_kk99_stake: 1000 },
        },
        {
            tier: 'GOLD',
            maker_fee: 0.02,
            taker_fee: 0.05,
            discount_percent: 60,
            requirements: { min_volume: 1000000, min_kk99_stake: 10000 },
        },
        {
            tier: 'PLATINUM',
            maker_fee: 0.01,
            taker_fee: 0.025,
            discount_percent: 80,
            requirements: { min_volume: 10000000, min_kk99_stake: 100000 },
        },
    ];

    /// Calculate user's current fee tier
    async calculateUserTier(userId: string): Promise<FeeStructure> {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Get 30-day volume
        const volumeResult = await query(
            `SELECT SUM(quantity * price) as total_notional
             FROM exchange.trades
             WHERE user_id = $1 AND created_at > $2`,
            [userId, thirtyDaysAgo]
        );

        const volume = volumeResult.rows[0]?.total_notional || 0;

        // Get KK99 holdings
        const balanceResult = await query(
            'SELECT kk99_balance FROM exchange.user_accounts WHERE user_id = $1',
            [userId]
        );

        const kk99Balance = balanceResult.rows[0]?.kk99_balance || 0;

        // Find applicable tier
        let applicableTier = this.feeTiers[0];
        for (let i = this.feeTiers.length - 1; i >= 0; i--) {
            if (
                volume >= this.feeTiers[i].requirements.min_volume &&
                kk99Balance >= this.feeTiers[i].requirements.min_kk99_stake
            ) {
                applicableTier = this.feeTiers[i];
                break;
            }
        }

        return applicableTier;
    }

    /// Calculate maker fee
    async calculateMakerFee(userId: string, quantity: number, price: number): Promise<number> {
        const tier = await this.calculateUserTier(userId);
        const notionalValue = quantity * price;
        return (notionalValue * tier.maker_fee) / 100;
    }

    /// Calculate taker fee
    async calculateTakerFee(userId: string, quantity: number, price: number): Promise<number> {
        const tier = await this.calculateUserTier(userId);
        const notionalValue = quantity * price;
        return (notionalValue * tier.taker_fee) / 100;
    }

    /// Get fee tier details
    async getUserFeeDetails(userId: string): Promise<any> {
        const tier = await this.calculateUserTier(userId);

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const volumeResult = await query(
            `SELECT SUM(quantity * price) as total_notional FROM exchange.trades WHERE user_id = $1 AND created_at > $2`,
            [userId, thirtyDaysAgo]
        );

        const balanceResult = await query(
            'SELECT kk99_balance FROM exchange.user_accounts WHERE user_id = $1',
            [userId]
        );

        return {
            current_tier: tier.tier,
            maker_fee: tier.maker_fee,
            taker_fee: tier.taker_fee,
            discount_percent: tier.discount_percent,
            volume_30d: volumeResult.rows[0]?.total_notional || 0,
            kk99_balance: balanceResult.rows[0]?.kk99_balance || 0,
            next_tier: this.getNextTier(tier.tier),
            volume_to_next: this.getVolumeToNextTier(tier.tier),
        };
    }

    /// Get referral fee rebate
    calculateReferralRebate(baseAmount: number, referralTier: string): number {
        const rebates: Record<string, number> = {
            BRONZE: 0.05,
            SILVER: 0.10,
            GOLD: 0.15,
            PLATINUM: 0.20,
        };

        return (baseAmount * (rebates[referralTier] || 0)) / 100;
    }

    /// Apply promotional discount
    applyPromotion(baseAmount: number, promoCode: string): number {
        const promos: Record<string, number> = {
            LAUNCH20: 0.20,
            VIP50: 0.50,
            WEEKEND10: 0.10,
        };

        const discount = promos[promoCode] || 0;
        return baseAmount * (1 - discount);
    }

    /// Get all tier requirements
    getTierRequirements(): FeeStructure[] {
        return this.feeTiers;
    }

    private getNextTier(currentTier: string): string | null {
        const tierOrder = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
        const index = tierOrder.indexOf(currentTier);
        return index < tierOrder.length - 1 ? tierOrder[index + 1] : null;
    }

    private getVolumeToNextTier(currentTier: string): number {
        const tierOrder = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
        const index = tierOrder.indexOf(currentTier);
        if (index < tierOrder.length - 1) {
            return this.feeTiers[index + 1].requirements.min_volume;
        }
        return 0;
    }
}

export const feeCalculator = new FeeCalculator();
