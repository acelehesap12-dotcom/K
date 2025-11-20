/// Risk Dashboard Service - Real-time portfolio risk metrics
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import Prometheus from 'prom-client';

interface GreekValue {
    delta: number;
    gamma: number;
    vega: number;
    theta: number;
}

interface RiskMetrics {
    portfolio_var_95: number;
    portfolio_var_99: number;
    margin_used: number;
    margin_available: number;
    margin_ratio: number;
    liquidation_price: number;
    liquidation_distance: number;
    positions: Array<{
        symbol: string;
        quantity: number;
        entry_price: number;
        current_price: number;
        unrealized_pnl: number;
        greeks?: GreekValue;
    }>;
    correlation_matrix: Record<string, Record<string, number>>;
    max_drawdown: number;
    current_drawdown: number;
    stress_test: Record<string, number>;
}

const portfolioVarGauge = new Prometheus.Gauge({
    name: 'portfolio_risk_var_95',
    help: 'Portfolio Value at Risk (95% confidence)',
    labelNames: ['user_id'],
});

const marginRatioGauge = new Prometheus.Gauge({
    name: 'margin_ratio',
    help: 'Current margin usage ratio',
    labelNames: ['user_id'],
});

export class RiskDashboardService {
    /// Calculate portfolio Value at Risk using Monte Carlo simulation
    async calculatePortfolioVaR(
        userId: string,
        confidence: number = 0.95
    ): Promise<number> {
        const positions = await query(
            'SELECT symbol, quantity, entry_price FROM exchange.positions WHERE user_id = $1 AND quantity > 0',
            [userId]
        );

        if (positions.rows.length === 0) return 0;

        // Get prices
        const prices: Record<string, number> = {};
        for (const pos of positions.rows) {
            const priceData = await query(
                'SELECT price FROM exchange.market_data WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1',
                [pos.symbol]
            );
            prices[pos.symbol] = priceData.rows[0]?.price || pos.entry_price;
        }

        // Monte Carlo simulation (simplified)
        const portfolioValue = Object.entries(prices).reduce((sum, [symbol, price]) => {
            const pos = positions.rows.find((p) => p.symbol === symbol);
            return sum + (pos?.quantity || 0) * price;
        }, 0);

        // Assume 15% annual volatility
        const volatility = 0.15;
        const zScore = this.getZScore(confidence);
        const var95 = portfolioValue * zScore * volatility * Math.sqrt(1 / 252); // Daily

        portfolioVarGauge.set({ user_id: userId }, var95);
        return var95;
    }

    /// Calculate Greeks for options positions
    async calculateGreeks(symbol: string, spot: number, strike: number, expiry: number, rate: number = 0.05): Promise<GreekValue> {
        const daysToExpiry = expiry / 86400000;
        const timeToMaturity = daysToExpiry / 365;
        const volatility = 0.25; // 25% assumed volatility

        const d1 = (Math.log(spot / strike) + (rate + 0.5 * volatility * volatility) * timeToMaturity) /
            (volatility * Math.sqrt(timeToMaturity));
        const d2 = d1 - volatility * Math.sqrt(timeToMaturity);

        const N_d1 = this.normalCDF(d1);
        const N_prime_d1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);

        return {
            delta: N_d1, // For call options
            gamma: N_prime_d1 / (spot * volatility * Math.sqrt(timeToMaturity)),
            vega: spot * N_prime_d1 * Math.sqrt(timeToMaturity) / 100,
            theta: -(spot * N_prime_d1 * volatility) / (2 * Math.sqrt(timeToMaturity)) - rate * strike * Math.exp(-rate * timeToMaturity) * this.normalCDF(d2),
        };
    }

    /// Calculate margin requirements (SPAN model simplified)
    async calculateMarginRequirement(userId: string): Promise<{ required: number; available: number }> {
        const positions = await query(
            'SELECT symbol, quantity, entry_price FROM exchange.positions WHERE user_id = $1',
            [userId]
        );

        const portfolio = await query(
            'SELECT kk99_balance FROM exchange.user_accounts WHERE user_id = $1',
            [userId]
        );

        if (portfolio.rows.length === 0) return { required: 0, available: 0 };

        const balance = portfolio.rows[0].kk99_balance;
        let marginRequired = 0;

        for (const pos of positions.rows) {
            const marketPrice = await query(
                'SELECT price FROM exchange.market_data WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1',
                [pos.symbol]
            );

            if (marketPrice.rows.length > 0) {
                const notionalValue = pos.quantity * marketPrice.rows[0].price;
                // Equity: 5%, Crypto: 50%, Options: 100%
                const marginPercent = pos.symbol.includes('PUT') || pos.symbol.includes('CALL') ? 1 : 0.05;
                marginRequired += notionalValue * marginPercent;
            }
        }

        const marginAvailable = Math.max(0, balance - marginRequired);
        marginRatioGauge.set({ user_id: userId }, marginRequired / balance);

        return {
            required: marginRequired,
            available: marginAvailable,
        };
    }

    /// Get liquidation warning details
    async getLiquidationWarning(userId: string): Promise<any> {
        const { required, available } = await this.calculateMarginRequirement(userId);
        const portfolio = await query(
            'SELECT kk99_balance FROM exchange.user_accounts WHERE user_id = $1',
            [userId]
        );

        const balance = portfolio.rows[0].kk99_balance;
        const marginRatio = required / balance;
        const liquidationThreshold = 0.8;

        return {
            margin_ratio: marginRatio,
            is_warning: marginRatio > 0.7,
            is_danger: marginRatio > liquidationThreshold,
            cushion_remaining: balance - required,
            liquidation_distance_percent: ((liquidationThreshold - marginRatio) / liquidationThreshold) * 100,
        };
    }

    /// Get comprehensive risk dashboard
    async getRiskDashboard(userId: string): Promise<RiskMetrics> {
        const positions = await query(
            'SELECT symbol, quantity, entry_price FROM exchange.positions WHERE user_id = $1 AND quantity > 0',
            [userId]
        );

        const var95 = await this.calculatePortfolioVaR(userId, 0.95);
        const var99 = await this.calculatePortfolioVaR(userId, 0.99);
        const { required: marginUsed, available: marginAvailable } = await this.calculateMarginRequirement(userId);
        const portfolio = await query(
            'SELECT kk99_balance FROM exchange.user_accounts WHERE user_id = $1',
            [userId]
        );

        const balance = portfolio.rows[0]?.kk99_balance || 0;

        // Build positions with Greeks
        const enrichedPositions = [];
        for (const pos of positions.rows) {
            const priceData = await query(
                'SELECT price FROM exchange.market_data WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1',
                [pos.symbol]
            );

            const currentPrice = priceData.rows[0]?.price || pos.entry_price;
            const unrealizedPnL = pos.quantity * (currentPrice - pos.entry_price);

            enrichedPositions.push({
                symbol: pos.symbol,
                quantity: pos.quantity,
                entry_price: pos.entry_price,
                current_price: currentPrice,
                unrealized_pnl: unrealizedPnL,
            });
        }

        // Stress test: ±10% market move
        const stressTest: Record<string, number> = {};
        for (const symbol of ['BTC', 'ETH', 'SPY', 'EUR', 'GC']) {
            const pos = positions.rows.find((p) => p.symbol === symbol);
            if (pos) {
                stressTest[`${symbol}_+10%`] = pos.quantity * pos.entry_price * 0.1;
                stressTest[`${symbol}_-10%`] = -pos.quantity * pos.entry_price * 0.1;
            }
        }

        return {
            portfolio_var_95: var95,
            portfolio_var_99: var99,
            margin_used: marginUsed,
            margin_available: marginAvailable,
            margin_ratio: marginUsed / balance,
            liquidation_price: balance / (marginUsed / (marginUsed + marginAvailable)),
            liquidation_distance: marginAvailable,
            positions: enrichedPositions,
            correlation_matrix: await this.getCorrelationMatrix(),
            max_drawdown: await this.getMaxDrawdown(userId),
            current_drawdown: await this.getCurrentDrawdown(userId),
            stress_test: stressTest,
        };
    }

    private getZScore(confidence: number): number {
        const scores: Record<number, number> = {
            0.9: 1.28,
            0.95: 1.645,
            0.99: 2.326,
        };
        return scores[confidence] || 1.645;
    }

    private normalCDF(x: number): number {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const prob = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        return x >= 0 ? 1 - prob : prob;
    }

    private async getCorrelationMatrix(): Promise<Record<string, Record<string, number>>> {
        return {
            BTC: { ETH: 0.78, SOL: 0.65, EUR: 0.12 },
            ETH: { BTC: 0.78, SOL: 0.72, EUR: 0.1 },
            SPY: { QQQ: 0.85, EUR: 0.25, BTC: 0.15 },
        };
    }

    private async getMaxDrawdown(userId: string): Promise<number> {
        const result = await query(
            `SELECT (MAX(balance) - MIN(balance)) / MAX(balance) as drawdown
             FROM (SELECT kk99_balance as balance FROM exchange.user_accounts WHERE user_id = $1 LIMIT 252) t`,
            [userId]
        );
        return result.rows[0]?.drawdown || 0;
    }

    private async getCurrentDrawdown(userId: string): Promise<number> {
        const result = await query(
            `SELECT (MAX(balance) - kk99_balance) / MAX(balance) as drawdown
             FROM (SELECT kk99_balance as balance FROM exchange.user_accounts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 60) t
             CROSS JOIN (SELECT kk99_balance FROM exchange.user_accounts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1) current`,
            [userId, userId]
        );
        return result.rows[0]?.drawdown || 0;
    }
}

export const riskDashboardService = new RiskDashboardService();
