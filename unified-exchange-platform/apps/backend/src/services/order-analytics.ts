/// Order Analytics Service
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export class OrderAnalyticsService {
    /// Get fill statistics
    async getFillStatistics(userId: string, symbol?: string, timeframe: string = '1d'): Promise<any> {
        const where = symbol ? `AND symbol = '${symbol}'` : '';
        const hours = timeframe === '1h' ? 1 : timeframe === '1d' ? 24 : 168;

        const result = await query(
            `SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = 'EXECUTED' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as fill_rate,
                AVG(CASE WHEN status = 'EXECUTED' THEN EXTRACT(EPOCH FROM (filled_at - created_at)) ELSE NULL END) as avg_fill_time_sec,
                SUM(quantity) as total_quantity,
                SUM(quantity * price) as total_notional
             FROM exchange.orders
             WHERE user_id = $1 ${where} AND created_at > NOW() - INTERVAL '${hours} hours'`,
            [userId]
        );

        return result.rows[0];
    }

    /// Get slippage distribution
    async getSlippageDistribution(userId: string, limit: number = 100): Promise<any> {
        const result = await query(
            `SELECT 
                symbol,
                COUNT(*) as trade_count,
                AVG(slippage_percent) as mean_slippage,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY slippage_percent) as p50,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY slippage_percent) as p95,
                PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY slippage_percent) as p99,
                MAX(slippage_percent) as max_slippage
             FROM exchange.trades
             WHERE user_id = $1
             GROUP BY symbol
             ORDER BY trade_count DESC
             LIMIT $2`,
            [userId, limit]
        );

        return result.rows;
    }

    /// Get trader performance metrics
    async getTraderMetrics(userId: string, symbol?: string): Promise<any> {
        const where = symbol ? `AND symbol = '${symbol}'` : '';

        const result = await query(
            `SELECT 
                COUNT(*) as closed_trades,
                SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as win_rate,
                SUM(CASE WHEN realized_pnl > 0 THEN realized_pnl ELSE 0 END) as gross_profit,
                SUM(CASE WHEN realized_pnl < 0 THEN ABS(realized_pnl) ELSE 0 END) as gross_loss,
                AVG(CASE WHEN realized_pnl > 0 THEN realized_pnl ELSE NULL END) as avg_win,
                AVG(CASE WHEN realized_pnl < 0 THEN ABS(realized_pnl) ELSE NULL END) as avg_loss
             FROM exchange.trades
             WHERE user_id = $1 ${where} AND status = 'CLOSED'`,
            [userId]
        );

        const row = result.rows[0];

        return {
            total_trades: row.closed_trades,
            win_rate: row.win_rate || 0,
            gross_profit: row.gross_profit || 0,
            gross_loss: row.gross_loss || 0,
            profit_factor: (row.gross_profit || 0) / (row.gross_loss || 1),
            avg_win: row.avg_win || 0,
            avg_loss: row.avg_loss || 0,
            risk_reward_ratio: (row.avg_win || 0) / (row.avg_loss || 1),
        };
    }

    /// Get market impact analysis
    async getMarketImpact(userId: string, symbol: string): Promise<any> {
        const result = await query(
            `SELECT 
                COUNT(*) as orders,
                SUM(quantity) as total_volume,
                AVG(price) as avg_price,
                STDDEV(price) as price_volatility
             FROM exchange.orders
             WHERE user_id = $1 AND symbol = $2 AND status = 'EXECUTED'`,
            [userId, symbol]
        );

        return result.rows[0];
    }

    /// Get order book depth at execution
    async getOrderBookDepth(symbol: string): Promise<any> {
        const result = await query(
            `SELECT 
                (SELECT SUM(quantity) FROM exchange.order_book WHERE symbol = $1 AND side = 'BUY' AND price > current_price) as buy_depth_1pct,
                (SELECT SUM(quantity) FROM exchange.order_book WHERE symbol = $1 AND side = 'SELL' AND price < current_price * 1.01) as sell_depth_1pct
             FROM (SELECT price as current_price FROM exchange.market_data WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1) t`,
            [symbol, symbol]
        );

        return result.rows[0];
    }

    /// Get best execution timing analysis
    async getExecutionTiming(userId: string): Promise<any> {
        const result = await query(
            `SELECT 
                EXTRACT(HOUR FROM created_at) as hour,
                COUNT(*) as orders,
                AVG(slippage_percent) as avg_slippage,
                AVG(fill_time_ms) as avg_fill_time
             FROM exchange.trades
             WHERE user_id = $1
             GROUP BY EXTRACT(HOUR FROM created_at)
             ORDER BY hour`,
            [userId]
        );

        return result.rows;
    }
}

export const orderAnalyticsService = new OrderAnalyticsService();
