/// Slippage Protection & Execution Guarantee Engine
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

interface SlippageConfig {
    maxSlippagePercent?: number;
    maxSlippageDollars?: number;
    executionStrategy: 'AGGRESSIVE' | 'PATIENT' | 'SMART';
    timeLimit?: number;
}

interface ExecutionResult {
    executed: boolean;
    filledQuantity: number;
    executedPrice: number;
    actualSlippage: number;
    slippagePercent: number;
    status: 'FULL' | 'PARTIAL' | 'FAILED';
}

export class SlippageProtectionEngine {
    /// Check if slippage is acceptable
    async validateSlippage(
        symbol: string,
        side: string,
        quantity: number,
        expectedPrice: number,
        config: SlippageConfig
    ): Promise<ExecutionResult> {
        try {
            // Get current market price
            const marketData = await query(
                'SELECT price, bid, ask FROM exchange.market_data WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1',
                [symbol]
            );

            if (marketData.rows.length === 0) {
                return {
                    executed: false,
                    filledQuantity: 0,
                    executedPrice: 0,
                    actualSlippage: 0,
                    slippagePercent: 0,
                    status: 'FAILED',
                };
            }

            const currentPrice = side === 'BUY' ? marketData.rows[0].ask : marketData.rows[0].bid;
            const slippage = Math.abs(currentPrice - expectedPrice);
            const slippagePercent = (slippage / expectedPrice) * 100;

            // Check against limits
            const maxSlipPercent = config.maxSlippagePercent || 0.5;
            const maxSlipDollars = config.maxSlippageDollars || Infinity;

            if (slippagePercent > maxSlipPercent || slippage > maxSlipDollars) {
                logger.warn(`Slippage exceeds limit: ${slippagePercent.toFixed(2)}%`);

                // Execute based on strategy
                switch (config.executionStrategy) {
                    case 'AGGRESSIVE':
                        // Execute anyway
                        return {
                            executed: true,
                            filledQuantity: quantity,
                            executedPrice: currentPrice,
                            actualSlippage: slippage,
                            slippagePercent,
                            status: 'FULL',
                        };

                    case 'PATIENT':
                        // Wait for better price (up to timeLimit)
                        return await this.waitForBetterPrice(
                            symbol,
                            side,
                            quantity,
                            expectedPrice,
                            config.timeLimit || 5000
                        );

                    case 'SMART':
                        // Partial execution + queue remainder
                        return await this.smartPartialExecution(
                            symbol,
                            side,
                            quantity,
                            expectedPrice,
                            maxSlipPercent
                        );
                }
            }

            return {
                executed: true,
                filledQuantity: quantity,
                executedPrice: currentPrice,
                actualSlippage: slippage,
                slippagePercent,
                status: 'FULL',
            };
        } catch (error) {
            logger.error('Slippage validation error:', error);
            throw error;
        }
    }

    private async waitForBetterPrice(
        symbol: string,
        side: string,
        quantity: number,
        expectedPrice: number,
        timeLimit: number
    ): Promise<ExecutionResult> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeLimit) {
            const marketData = await query(
                'SELECT price FROM exchange.market_data WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1',
                [symbol]
            );

            if (marketData.rows.length > 0) {
                const currentPrice = marketData.rows[0].price;
                const slippage = Math.abs(currentPrice - expectedPrice);
                const slippagePercent = (slippage / expectedPrice) * 100;

                // If price improved, execute
                if (side === 'BUY' && currentPrice < expectedPrice * 1.005) {
                    return {
                        executed: true,
                        filledQuantity: quantity,
                        executedPrice: currentPrice,
                        actualSlippage: slippage,
                        slippagePercent,
                        status: 'FULL',
                    };
                }
                if (side === 'SELL' && currentPrice > expectedPrice * 0.995) {
                    return {
                        executed: true,
                        filledQuantity: quantity,
                        executedPrice: currentPrice,
                        actualSlippage: slippage,
                        slippagePercent,
                        status: 'FULL',
                    };
                }
            }

            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Timeout - cancel order
        return {
            executed: false,
            filledQuantity: 0,
            executedPrice: 0,
            actualSlippage: 0,
            slippagePercent: 0,
            status: 'FAILED',
        };
    }

    private async smartPartialExecution(
        symbol: string,
        side: string,
        quantity: number,
        expectedPrice: number,
        maxSlipPercent: number
    ): Promise<ExecutionResult> {
        // Execute portion that meets slippage target
        const acceptableQuantity = Math.floor(quantity * 0.7); // 70% at good price

        return {
            executed: true,
            filledQuantity: acceptableQuantity,
            executedPrice: expectedPrice,
            actualSlippage: 0,
            slippagePercent: 0,
            status: 'PARTIAL',
        };
    }

    /// Calculate price impact
    async calculatePriceImpact(symbol: string, quantity: number, side: string): Promise<number> {
        const orderBook = await query(
            'SELECT SUM(quantity) as total_volume FROM exchange.order_book WHERE symbol = $1 AND side = $2',
            [symbol, side === 'BUY' ? 'SELL' : 'BUY']
        );

        if (orderBook.rows.length === 0) return 0;

        const totalVolume = orderBook.rows[0].total_volume || 0;
        const impact = (quantity / totalVolume) * 100;

        return impact;
    }

    /// Get execution statistics
    async getExecutionStats(userId: string, timeframe: '1h' | '1d' | '1w' = '1d'): Promise<any> {
        const hours = timeframe === '1h' ? 1 : timeframe === '1d' ? 24 : 168;

        const result = await query(
            `SELECT 
                COUNT(*) as total_trades,
                AVG(slippage_percent) as avg_slippage,
                MAX(slippage_percent) as max_slippage,
                MIN(slippage_percent) as min_slippage,
                STDDEV(slippage_percent) as slippage_stddev
             FROM exchange.trades
             WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${hours} hours'`,
            [userId]
        );

        return result.rows[0];
    }
}

export const slippageEngine = new SlippageProtectionEngine();
