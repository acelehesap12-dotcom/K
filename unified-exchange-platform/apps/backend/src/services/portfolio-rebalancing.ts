/// Portfolio Rebalancing Engine
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

interface AllocationConfig {
    [symbol: string]: number; // Target percentage
}

interface RebalanceResult {
    trades_executed: number;
    total_cost: number;
    current_drift: number;
    target_drift: number;
    execution_time: number;
}

export class PortfolioRebalancingEngine {
    /// Calculate portfolio drift from target
    async calculateDrift(userId: string, targetAllocation: AllocationConfig): Promise<number> {
        const positions = await query(
            'SELECT symbol, quantity FROM exchange.positions WHERE user_id = $1 AND quantity > 0',
            [userId]
        );

        const portfolioValue = await this.getPortfolioValue(userId);
        if (portfolioValue === 0) return 0;

        let drift = 0;
        for (const [symbol, targetPercent] of Object.entries(targetAllocation)) {
            const position = positions.rows.find((p) => p.symbol === symbol);
            const positionValue = position ? position.quantity * (await this.getSymbolPrice(symbol)) : 0;
            const currentPercent = positionValue / portfolioValue;
            const targetDecimal = targetPercent / 100;

            drift += Math.abs(currentPercent - targetDecimal);
        }

        return drift;
    }

    /// Execute automatic rebalancing
    async executeRebalance(
        userId: string,
        targetAllocation: AllocationConfig,
        options: {
            maxCost?: number;
            minDrift?: number;
            taxOptimized?: boolean;
        } = {}
    ): Promise<RebalanceResult> {
        const startTime = Date.now();
        const minDrift = options.minDrift || 0.05; // 5% drift threshold
        const maxCost = options.maxCost || Infinity;

        const currentDrift = await this.calculateDrift(userId, targetAllocation);

        if (currentDrift < minDrift) {
            logger.info(`Drift ${currentDrift.toFixed(2)} below threshold ${minDrift.toFixed(2)}`);
            return {
                trades_executed: 0,
                total_cost: 0,
                current_drift: currentDrift,
                target_drift: minDrift,
                execution_time: Date.now() - startTime,
            };
        }

        const positions = await query(
            'SELECT symbol, quantity FROM exchange.positions WHERE user_id = $1 AND quantity > 0',
            [userId]
        );

        const portfolioValue = await this.getPortfolioValue(userId);
        let totalCost = 0;
        let tradesExecuted = 0;

        // Calculate rebalancing trades
        const trades: Array<{ symbol: string; action: string; quantity: number; price: number }> = [];

        for (const [symbol, targetPercent] of Object.entries(targetAllocation)) {
            const targetValue = portfolioValue * (targetPercent / 100);
            const price = await this.getSymbolPrice(symbol);
            const position = positions.rows.find((p) => p.symbol === symbol);
            const currentQuantity = position?.quantity || 0;
            const currentValue = currentQuantity * price;

            const targetQuantity = targetValue / price;
            const diff = targetQuantity - currentQuantity;

            if (Math.abs(diff) > 0.01) {
                // Only rebalance if difference > 0.01 units
                trades.push({
                    symbol,
                    action: diff > 0 ? 'BUY' : 'SELL',
                    quantity: Math.abs(diff),
                    price,
                });
            }
        }

        // Execute trades respecting cost limit
        for (const trade of trades) {
            const tradeCost = trade.quantity * trade.price * 0.001; // 0.1% fee estimate

            if (totalCost + tradeCost > maxCost) {
                logger.warn(`Rebalancing stopped: cost limit reached`);
                break;
            }

            await query(
                `INSERT INTO exchange.orders 
                 (user_id, symbol, order_type, side, quantity, price, status, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                [userId, trade.symbol, 'LIMIT', trade.action, trade.quantity, trade.price, 'EXECUTED']
            );

            totalCost += tradeCost;
            tradesExecuted++;

            logger.info(`Rebalance trade: ${trade.action} ${trade.quantity} ${trade.symbol} @ ${trade.price}`);
        }

        return {
            trades_executed: tradesExecuted,
            total_cost: totalCost,
            current_drift: await this.calculateDrift(userId, targetAllocation),
            target_drift: minDrift,
            execution_time: Date.now() - startTime,
        };
    }

    /// Get rebalancing suggestions
    async getRebalanceSuggestions(userId: string, targetAllocation: AllocationConfig): Promise<any[]> {
        const positions = await query(
            'SELECT symbol, quantity FROM exchange.positions WHERE user_id = $1 AND quantity > 0',
            [userId]
        );

        const suggestions = [];
        const portfolioValue = await this.getPortfolioValue(userId);

        for (const [symbol, targetPercent] of Object.entries(targetAllocation)) {
            const targetValue = portfolioValue * (targetPercent / 100);
            const price = await this.getSymbolPrice(symbol);
            const position = positions.rows.find((p) => p.symbol === symbol);
            const currentValue = (position?.quantity || 0) * price;
            const diff = targetValue - currentValue;

            if (Math.abs(diff) > 100) {
                // Only suggest if > $100 difference
                suggestions.push({
                    symbol,
                    action: diff > 0 ? 'BUY' : 'SELL',
                    amount: Math.abs(diff),
                    targetPercent,
                    currentPercent: currentValue / portfolioValue,
                });
            }
        }

        return suggestions;
    }

    /// Scheduled rebalancing (e.g., monthly)
    async scheduleRebalancing(
        userId: string,
        targetAllocation: AllocationConfig,
        frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY'
    ): Promise<void> {
        const nextRun = this.calculateNextRun(frequency);

        await query(
            `INSERT INTO exchange.rebalancing_schedules 
             (user_id, target_allocation, frequency, next_run, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [userId, JSON.stringify(targetAllocation), frequency, nextRun]
        );

        logger.info(`Scheduled ${frequency} rebalancing for user ${userId}`);
    }

    private calculateNextRun(frequency: string): Date {
        const now = new Date();
        switch (frequency) {
            case 'DAILY':
                return new Date(now.getTime() + 24 * 60 * 60 * 1000);
            case 'WEEKLY':
                return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            case 'MONTHLY':
                return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            case 'QUARTERLY':
                return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
            default:
                return new Date();
        }
    }

    private async getPortfolioValue(userId: string): Promise<number> {
        const positions = await query(
            'SELECT symbol, quantity FROM exchange.positions WHERE user_id = $1 AND quantity > 0',
            [userId]
        );

        let totalValue = 0;
        for (const pos of positions.rows) {
            const price = await this.getSymbolPrice(pos.symbol);
            totalValue += pos.quantity * price;
        }

        return totalValue;
    }

    private async getSymbolPrice(symbol: string): Promise<number> {
        const result = await query(
            'SELECT price FROM exchange.market_data WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1',
            [symbol]
        );

        return result.rows[0]?.price || 0;
    }
}

export const rebalancingEngine = new PortfolioRebalancingEngine();
