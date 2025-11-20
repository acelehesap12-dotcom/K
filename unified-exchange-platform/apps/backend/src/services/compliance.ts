/// Compliance & Regulatory Module
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export class ComplianceService {
    /// AML/KYC verification
    async runAmlKycCheck(userId: string): Promise<any> {
        const userResult = await query(
            'SELECT email, name, country FROM exchange.users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            throw new Error('User not found');
        }

        const user = userResult.rows[0];

        // Check sanctions list (simplified)
        const sanctionsMatch = await this.checkSanctionsList(user.name, user.country);

        if (sanctionsMatch) {
            logger.warn(`User ${userId} matched sanctions list`);
            return {
                status: 'REJECTED',
                reason: 'Sanctions list match',
                timestamp: new Date(),
            };
        }

        // Check AML score
        const amlScore = Math.random() * 100;

        if (amlScore > 75) {
            return {
                status: 'PENDING',
                reason: 'Manual review required',
                aml_score: amlScore,
                timestamp: new Date(),
            };
        }

        // Approved
        await query(
            'UPDATE exchange.users SET aml_kyc_verified = TRUE, aml_kyc_verified_at = NOW() WHERE id = $1',
            [userId]
        );

        return {
            status: 'APPROVED',
            aml_score: amlScore,
            timestamp: new Date(),
        };
    }

    /// Check sanctions list
    private async checkSanctionsList(name: string, country: string): Promise<boolean> {
        const sanctionedCountries = ['KP', 'IR', 'SY', 'CU']; // North Korea, Iran, Syria, Cuba

        if (sanctionedCountries.includes(country)) {
            logger.warn(`Country ${country} on sanctions list`);
            return true;
        }

        // In production, check against OFAC, EU, UN lists
        return false;
    }

    /// Enforce position limits
    async enforcePositionLimits(
        userId: string,
        symbol: string,
        quantity: number
    ): Promise<{ allowed: boolean; reason?: string }> {
        // Check user position limit
        const currentPosition = await query(
            'SELECT quantity FROM exchange.positions WHERE user_id = $1 AND symbol = $2',
            [userId, symbol]
        );

        const currentQuantity = currentPosition.rows[0]?.quantity || 0;
        const newQuantity = currentQuantity + quantity;

        // Per-symbol limit: 10% of daily volume
        const dailyVolume = await query(
            `SELECT SUM(quantity) as total FROM exchange.trades
             WHERE symbol = $1 AND created_at > NOW() - INTERVAL '1 day'`,
            [symbol]
        );

        const maxPositionPercent = 0.1; // 10%
        const dailyVolumeTotal = dailyVolume.rows[0]?.total || 1;
        const maxPosition = dailyVolumeTotal * maxPositionPercent;

        if (newQuantity > maxPosition) {
            return {
                allowed: false,
                reason: `Position limit exceeded (${newQuantity} > ${maxPosition})`,
            };
        }

        return { allowed: true };
    }

    /// Generate regulatory report
    async generateRegulatoryReport(
        startDate: Date,
        endDate: Date,
        jurisdiction: 'SEC' | 'CFTC' | 'FCA'
    ): Promise<any> {
        const report: any = {
            jurisdiction,
            period: { start: startDate, end: endDate },
            generated_at: new Date(),
        };

        // Get trading statistics
        const stats = await query(
            `SELECT 
                COUNT(*) as total_trades,
                SUM(quantity * price) as total_notional,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT symbol) as traded_symbols
             FROM exchange.trades
             WHERE created_at BETWEEN $1 AND $2`,
            [startDate, endDate]
        );

        report.trading_stats = stats.rows[0];

        // Get derivative trading (for CFTC)
        if (jurisdiction === 'CFTC') {
            const derivatives = await query(
                `SELECT symbol, SUM(quantity) as total_quantity
                 FROM exchange.trades
                 WHERE symbol IN ('ES', 'NQ', 'GC') AND created_at BETWEEN $1 AND $2
                 GROUP BY symbol`,
                [startDate, endDate]
            );

            report.derivative_trading = derivatives.rows;
        }

        // Get options trading
        const options = await query(
            `SELECT symbol, SUM(quantity) as total_quantity
             FROM exchange.trades
             WHERE symbol LIKE '%CALL%' OR symbol LIKE '%PUT%'
               AND created_at BETWEEN $1 AND $2
             GROUP BY symbol`,
            [startDate, endDate]
        );

        report.options_trading = options.rows;

        logger.info(`Generated ${jurisdiction} report for ${startDate} to ${endDate}`);

        return report;
    }

    /// Track all trading activities for audit
    async logAuditTrail(
        userId: string,
        action: string,
        details: any
    ): Promise<void> {
        await query(
            `INSERT INTO exchange.audit_log (user_id, action, details, created_at)
             VALUES ($1, $2, $3, NOW())`,
            [userId, action, JSON.stringify(details)]
        );
    }

    /// Get trading surveillance flags
    async getTradeFlags(userId: string): Promise<any[]> {
        const result = await query(
            `SELECT id, flag_type, severity, description, created_at
             FROM exchange.trade_flags
             WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );

        return result.rows;
    }

    /// Check for suspicious trading patterns
    async detectAnomalies(userId: string): Promise<string[]> {
        const anomalies: string[] = [];

        // Check 1: Rapid order cancellation
        const canceledOrders = await query(
            `SELECT COUNT(*) as count FROM exchange.orders
             WHERE user_id = $1 AND status = 'CANCELLED'
               AND created_at > NOW() - INTERVAL '1 hour'`,
            [userId]
        );

        if (canceledOrders.rows[0].count > 50) {
            anomalies.push('RAPID_ORDER_CANCELLATION');
        }

        // Check 2: Round-trip trades (wash trading)
        const roundTrips = await query(
            `SELECT COUNT(*) as count FROM exchange.trades t1
             WHERE t1.user_id = $1
               AND EXISTS (
                   SELECT 1 FROM exchange.trades t2
                   WHERE t2.user_id = $1
                     AND t2.symbol = t1.symbol
                     AND t2.side = (CASE WHEN t1.side = 'BUY' THEN 'SELL' ELSE 'BUY' END)
                     AND t2.created_at BETWEEN t1.created_at AND t1.created_at + INTERVAL '10 minutes'
               )`,
            [userId]
        );

        if (roundTrips.rows[0].count > 10) {
            anomalies.push('POTENTIAL_WASH_TRADING');
        }

        // Check 3: Spoofing (large orders that are cancelled)
        const spoofing = await query(
            `SELECT COUNT(*) as count FROM exchange.orders
             WHERE user_id = $1 AND quantity > 1000 AND status = 'CANCELLED'
               AND EXTRACT(EPOCH FROM (cancelled_at - created_at)) < 5`,
            [userId]
        );

        if (spoofing.rows[0].count > 5) {
            anomalies.push('POTENTIAL_SPOOFING');
        }

        if (anomalies.length > 0) {
            logger.warn(`Anomalies detected for user ${userId}: ${anomalies.join(', ')}`);

            // Log flag
            for (const anomaly of anomalies) {
                await this.logAuditTrail(userId, 'ANOMALY_DETECTED', {
                    type: anomaly,
                });
            }
        }

        return anomalies;
    }

    /// Get compliance status
    async getComplianceStatus(userId: string): Promise<any> {
        const result = await query(
            `SELECT 
                aml_kyc_verified,
                aml_kyc_verified_at,
                trade_flags.count as active_flags
             FROM exchange.users u
             LEFT JOIN (
                 SELECT user_id, COUNT(*) as count FROM exchange.trade_flags
                 GROUP BY user_id
             ) trade_flags ON u.id = trade_flags.user_id
             WHERE u.id = $1`,
            [userId]
        );

        return result.rows[0];
    }
}

export const complianceService = new ComplianceService();
