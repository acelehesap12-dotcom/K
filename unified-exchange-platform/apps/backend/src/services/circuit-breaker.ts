/// Circuit Breaker Service for KK99
/// Prevents cascading failures through price spike detection,
/// volume anomaly detection, and correlation monitoring
import { logger } from '../utils/logger.js';
import { query } from '../db/connection.js';
import Prometheus from 'prom-client';

interface CircuitState {
    symbol: string;
    isTripped: boolean;
    tripReason: string;
    tripTime: number;
    recoveryTime?: number;
    tripCount: number;
}

interface VolumeAnomaly {
    symbol: string;
    currentVolume: number;
    averageVolume: number;
    anomalyRatio: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface CorrelationBreak {
    symbol1: string;
    symbol2: string;
    expectedCorrelation: number;
    actualCorrelation: number;
    breakIntensity: number;
    isBreak: boolean;
}

interface CircuitBreakerResult {
    isTripped: boolean;
    reason?: string;
    severity: 'NORMAL' | 'WARNING' | 'CRITICAL';
    recoveryEstimate: number; // ms
    affectedSymbols: string[];
}

// Metrics
const circuitBreakerTrips = new Prometheus.Counter({
    name: 'circuit_breaker_trips_total',
    help: 'Total number of circuit breaker trips',
    labelNames: ['symbol', 'reason'],
});

const circuitBreakerRecoveries = new Prometheus.Counter({
    name: 'circuit_breaker_recoveries_total',
    help: 'Total number of circuit breaker recoveries',
    labelNames: ['symbol'],
});

const priceSpikesDetected = new Prometheus.Counter({
    name: 'price_spikes_detected_total',
    help: 'Total price spikes detected',
    labelNames: ['symbol', 'severity'],
});

const volumeAnomaliesDetected = new Prometheus.Counter({
    name: 'volume_anomalies_detected_total',
    help: 'Total volume anomalies detected',
    labelNames: ['symbol', 'severity'],
});

const correlationBreaksDetected = new Prometheus.Counter({
    name: 'correlation_breaks_detected_total',
    help: 'Total correlation breaks detected',
    labelNames: ['symbol1', 'symbol2'],
});

const marketStressLevel = new Prometheus.Gauge({
    name: 'market_stress_level',
    help: 'Current market stress level (0-100)',
    labelNames: ['symbol'],
});

export class CircuitBreakerService {
    private circuitStates: Map<string, CircuitState> = new Map();
    private priceHistory: Map<string, number[]> = new Map();
    private volumeHistory: Map<string, number[]> = new Map();
    private correlationMatrix: Map<string, Map<string, number>> = new Map();
    private readonly MAX_HISTORY = 60; // Keep last 60 data points
    private readonly RECOVERY_DURATION = 5 * 60 * 1000; // 5 minutes
    private readonly PRICE_SPIKE_THRESHOLD = 0.10; // 10% change
    private readonly VOLUME_SPIKE_THRESHOLD = 2.0; // 2x average
    private readonly SPREAD_THRESHOLD = 0.02; // 2% bid-ask spread
    private readonly CORRELATION_BREAK_THRESHOLD = 0.3; // 30% deviation

    async initialize() {
        logger.info('Circuit Breaker Service initialized');
        
        // Start background monitoring
        this.startMonitoring();
    }

    private startMonitoring() {
        setInterval(async () => {
            try {
                await this.monitorMarketHealth();
                await this.detectCorrelationBreaks();
                await this.checkRecoveryStatus();
            } catch (error) {
                logger.error('Circuit breaker monitoring error:', error);
            }
        }, 5000); // Every 5 seconds
    }

    /// Check if trading should be halted for a symbol
    async checkCircuitBreaker(
        symbol: string,
        currentPrice: number,
        bid: number,
        ask: number,
        volume: number,
    ): Promise<CircuitBreakerResult> {
        // Check if circuit already tripped
        const state = this.circuitStates.get(symbol);
        if (state?.isTripped) {
            const recoveryEst = state.recoveryTime
                ? Math.max(0, state.recoveryTime - Date.now())
                : this.RECOVERY_DURATION;
            return {
                isTripped: true,
                reason: state.tripReason,
                severity: 'CRITICAL',
                recoveryEstimate: recoveryEst,
                affectedSymbols: [symbol],
            };
        }

        const checks = [
            await this.checkPriceSpike(symbol, currentPrice),
            await this.checkVolumeAnomaly(symbol, volume),
            await this.checkBidAskSpread(bid, ask),
            await this.checkExchangeConnectivity(symbol),
        ];

        const failedChecks = checks.filter((c) => c !== null);

        if (failedChecks.length > 0) {
            const reason = failedChecks[0] as string;
            await this.tripCircuit(symbol, reason);

            circuitBreakerTrips.inc({ symbol, reason });

            return {
                isTripped: true,
                reason,
                severity: failedChecks.length > 2 ? 'CRITICAL' : 'WARNING',
                recoveryEstimate: this.RECOVERY_DURATION,
                affectedSymbols: await this.getCorrelatedSymbols(symbol),
            };
        }

        marketStressLevel.set({ symbol }, 0);
        return {
            isTripped: false,
            severity: 'NORMAL',
            recoveryEstimate: 0,
            affectedSymbols: [],
        };
    }

    /// Detect price spikes
    private async checkPriceSpike(symbol: string, currentPrice: number): Promise<string | null> {
        const history = this.priceHistory.get(symbol) || [];
        history.push(currentPrice);

        if (history.length > this.MAX_HISTORY) {
            history.shift();
        }

        this.priceHistory.set(symbol, history);

        if (history.length < 10) return null; // Need at least 10 data points

        const avgPrice = history.slice(-10).reduce((a, b) => a + b, 0) / 10;
        const priceChange = Math.abs(currentPrice - avgPrice) / avgPrice;

        if (priceChange > this.PRICE_SPIKE_THRESHOLD) {
            const severity =
                priceChange > 0.20
                    ? 'CRITICAL'
                    : priceChange > 0.15
                      ? 'HIGH'
                      : 'MEDIUM';

            priceSpikesDetected.inc({ symbol, severity });
            logger.warn(
                `Price spike detected for ${symbol}: ${(priceChange * 100).toFixed(2)}% change`,
            );

            marketStressLevel.set({ symbol }, Math.min(100, priceChange * 1000));
            return `Price spike: ${(priceChange * 100).toFixed(2)}% change in 60 seconds`;
        }

        return null;
    }

    /// Detect volume anomalies
    private async checkVolumeAnomaly(symbol: string, volume: number): Promise<string | null> {
        const history = this.volumeHistory.get(symbol) || [];
        history.push(volume);

        if (history.length > this.MAX_HISTORY) {
            history.shift();
        }

        this.volumeHistory.set(symbol, history);

        if (history.length < 20) return null; // Need at least 20 data points

        const avgVolume = history.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const volumeRatio = volume / avgVolume;

        if (volumeRatio > this.VOLUME_SPIKE_THRESHOLD) {
            const severity =
                volumeRatio > 5.0
                    ? 'CRITICAL'
                    : volumeRatio > 3.0
                      ? 'HIGH'
                      : 'MEDIUM';

            volumeAnomaliesDetected.inc({ symbol, severity });
            logger.warn(
                `Volume anomaly detected for ${symbol}: ${volumeRatio.toFixed(2)}x average`,
            );

            marketStressLevel.inc({ symbol }, volumeRatio * 10);
            return `Volume anomaly: ${volumeRatio.toFixed(2)}x average volume`;
        }

        return null;
    }

    /// Check bid-ask spread
    private async checkBidAskSpread(bid: number, ask: number): Promise<string | null> {
        const spread = (ask - bid) / bid;

        if (spread > this.SPREAD_THRESHOLD) {
            logger.warn(
                `High bid-ask spread detected: ${(spread * 100).toFixed(2)}%`,
            );
            return `Bid-ask spread too wide: ${(spread * 100).toFixed(2)}%`;
        }

        return null;
    }

    /// Check external exchange connectivity
    private async checkExchangeConnectivity(symbol: string): Promise<string | null> {
        try {
            // Check if we can reach market data for this symbol
            const result = await query(
                'SELECT id FROM exchange.market_data WHERE symbol = $1 AND created_at > NOW() - INTERVAL \'1 minute\'',
                [symbol],
            );

            if (result.rows.length === 0) {
                logger.error(`No recent market data for ${symbol} - possible connectivity issue`);
                return 'External exchange connectivity issue';
            }

            return null;
        } catch (error) {
            logger.error(`Failed to check connectivity for ${symbol}:`, error);
            return 'Database connectivity issue';
        }
    }

    /// Trip the circuit for a symbol
    private async tripCircuit(symbol: string, reason: string) {
        const state: CircuitState = {
            symbol,
            isTripped: true,
            tripReason: reason,
            tripTime: Date.now(),
            recoveryTime: Date.now() + this.RECOVERY_DURATION,
            tripCount: (this.circuitStates.get(symbol)?.tripCount || 0) + 1,
        };

        this.circuitStates.set(symbol, state);

        logger.error(`Circuit breaker TRIPPED for ${symbol}: ${reason}`);

        // Log to database for audit
        try {
            await query(
                `INSERT INTO exchange.circuit_breaker_events (symbol, reason, trip_time, recovery_time)
                 VALUES ($1, $2, $3, $4)`,
                [symbol, reason, new Date(state.tripTime), new Date(state.recoveryTime)],
            );
        } catch (error) {
            logger.error('Failed to log circuit breaker event:', error);
        }
    }

    /// Check if circuit should recover
    private async checkRecoveryStatus() {
        const now = Date.now();

        for (const [symbol, state] of this.circuitStates.entries()) {
            if (state.isTripped && state.recoveryTime && now > state.recoveryTime) {
                await this.resetCircuit(symbol);
            }
        }
    }

    /// Reset circuit to normal operation
    private async resetCircuit(symbol: string) {
        const state = this.circuitStates.get(symbol);
        if (state) {
            state.isTripped = false;
            logger.info(`Circuit breaker RECOVERED for ${symbol}`);
            circuitBreakerRecoveries.inc({ symbol });
        }
    }

    /// Monitor overall market health
    private async monitorMarketHealth() {
        try {
            const result = await query(
                `SELECT symbol, 
                        COUNT(*) as trade_count,
                        SUM(quantity) as total_volume,
                        AVG(price) as avg_price,
                        MAX(price) - MIN(price) as price_range
                 FROM exchange.trades
                 WHERE created_at > NOW() - INTERVAL '1 minute'
                 GROUP BY symbol`,
                [],
            );

            for (const row of result.rows) {
                const stress =
                    (row.price_range / row.avg_price) * 100 +
                    (row.total_volume / 1000) * 10;

                marketStressLevel.set({ symbol: row.symbol }, Math.min(100, stress));
            }
        } catch (error) {
            logger.error('Failed to monitor market health:', error);
        }
    }

    /// Detect correlation breaks between assets
    private async detectCorrelationBreaks() {
        const correlatedPairs = [
            ['BTC', 'ETH'],
            ['SPY', 'QQQ'],
            ['EUR', 'GBP'],
            ['AAPL', 'MSFT'],
        ];

        for (const [symbol1, symbol2] of correlatedPairs) {
            const prices1 = this.priceHistory.get(symbol1) || [];
            const prices2 = this.priceHistory.get(symbol2) || [];

            if (prices1.length < 20 || prices2.length < 20) continue;

            const corr = this.calculateCorrelation(
                prices1.slice(-20),
                prices2.slice(-20),
            );
            const expectedCorr = 0.75; // Historical average

            if (Math.abs(corr - expectedCorr) > this.CORRELATION_BREAK_THRESHOLD) {
                correlationBreaksDetected.inc({
                    symbol1,
                    symbol2,
                });

                logger.warn(
                    `Correlation break detected: ${symbol1}-${symbol2}. Expected: ${expectedCorr.toFixed(2)}, Actual: ${corr.toFixed(2)}`,
                );
            }
        }
    }

    /// Calculate correlation coefficient between two arrays
    private calculateCorrelation(arr1: number[], arr2: number[]): number {
        const n = Math.min(arr1.length, arr2.length);
        const mean1 = arr1.slice(-n).reduce((a, b) => a + b, 0) / n;
        const mean2 = arr2.slice(-n).reduce((a, b) => a + b, 0) / n;

        let numerator = 0;
        let denom1 = 0;
        let denom2 = 0;

        for (let i = 0; i < n; i++) {
            const d1 = arr1[arr1.length - n + i] - mean1;
            const d2 = arr2[arr2.length - n + i] - mean2;
            numerator += d1 * d2;
            denom1 += d1 * d1;
            denom2 += d2 * d2;
        }

        return numerator / Math.sqrt(denom1 * denom2);
    }

    /// Get all correlated symbols that would be affected by a circuit break
    private async getCorrelatedSymbols(symbol: string): Promise<string[]> {
        const correlations: Record<string, string[]> = {
            BTC: ['ETH', 'SOL'],
            ETH: ['BTC', 'SOL'],
            SPY: ['QQQ', 'IVV'],
            QQQ: ['SPY', 'IVV'],
            EUR: ['GBP', 'JPY'],
        };

        return correlations[symbol] || [];
    }

    /// Get current circuit breaker status for all symbols
    public getStatus(): CircuitState[] {
        return Array.from(this.circuitStates.values());
    }

    /// Get market stress level
    public getMarketStress(symbol: string): number {
        // Get from metrics
        return 0; // This would read from Prometheus in production
    }

    /// Get correlation matrix for all tracked pairs
    public getCorrelationMatrix(): Record<string, Record<string, number>> {
        const matrix: Record<string, Record<string, number>> = {};

        for (const [symbol1, correlations] of this.correlationMatrix.entries()) {
            matrix[symbol1] = {};
            for (const [symbol2, corr] of correlations.entries()) {
                matrix[symbol1][symbol2] = corr;
            }
        }

        return matrix;
    }
}

// Export singleton instance
export const circuitBreakerService = new CircuitBreakerService();
