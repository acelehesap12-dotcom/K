/// Smart Order Routing (SOR) Engine
import { logger } from '../utils/logger.js';

interface Market {
    name: string;
    symbol: string;
    bid: number;
    ask: number;
    liquidity: number;
}

interface ExecutionPlan {
    route: string;
    venue: string;
    quantity: number;
    estimated_price: number;
    estimated_impact: number;
}

export class SmartOrderRouter {
    private markets: Market[] = [];

    /// Find best execution across multiple venues
    async findBestExecution(
        symbol: string,
        quantity: number,
        side: 'BUY' | 'SELL'
    ): Promise<ExecutionPlan[]> {
        // Get market data from multiple venues
        const venues = await this.getMarketData(symbol);

        if (venues.length === 0) {
            throw new Error('No market data available');
        }

        // Calculate execution plans
        const plans: ExecutionPlan[] = [];

        // Single venue execution
        for (const venue of venues) {
            const plan = this.calculateExecutionPlan(venue, quantity, side);
            plans.push(plan);
        }

        // Multi-venue execution (split orders)
        if (venues.length > 1) {
            const splitPlan = this.calculateSplitExecution(venues, quantity, side);
            plans.push(...splitPlan);
        }

        // Sort by best price
        plans.sort((a, b) => {
            return side === 'BUY'
                ? a.estimated_price - b.estimated_price
                : b.estimated_price - a.estimated_price;
        });

        logger.info(`SOR: Found ${plans.length} execution routes for ${quantity} ${symbol}`);

        return plans;
    }

    /// Calculate execution plan for single venue
    private calculateExecutionPlan(
        venue: Market,
        quantity: number,
        side: 'BUY' | 'SELL'
    ): ExecutionPlan {
        const price = side === 'BUY' ? venue.ask : venue.bid;
        const impact = this.calculateMarketImpact(quantity, venue.liquidity);

        const executedPrice = side === 'BUY'
            ? price * (1 + impact / 100)
            : price * (1 - impact / 100);

        return {
            route: `SINGLE_VENUE_${venue.name}`,
            venue: venue.name,
            quantity,
            estimated_price: executedPrice,
            estimated_impact: impact,
        };
    }

    /// Split execution across multiple venues
    private calculateSplitExecution(
        venues: Market[],
        quantity: number,
        side: 'BUY' | 'SELL'
    ): ExecutionPlan[] {
        const splitPlans: ExecutionPlan[] = [];

        // Weighted distribution (better liquidity = more volume)
        const totalLiquidity = venues.reduce((sum, v) => sum + v.liquidity, 0);
        let remainingQuantity = quantity;

        for (let i = 0; i < venues.length && remainingQuantity > 0; i++) {
            const venue = venues[i];
            const allocationPercent = venue.liquidity / totalLiquidity;
            const allocatedQuantity = Math.min(
                Math.floor(quantity * allocationPercent),
                remainingQuantity
            );

            if (allocatedQuantity > 0) {
                const plan = this.calculateExecutionPlan(venue, allocatedQuantity, side);
                plan.route = `SPLIT_${i + 1}_OF_${venues.length}`;
                splitPlans.push(plan);

                remainingQuantity -= allocatedQuantity;
            }
        }

        return splitPlans;
    }

    /// Calculate market impact
    private calculateMarketImpact(quantity: number, liquidity: number): number {
        if (liquidity === 0) return 100; // No liquidity

        const impactPercent = (quantity / liquidity) * 0.5; // Simplified model
        return Math.min(impactPercent, 5); // Cap at 5%
    }

    /// ML-based prediction of best execution
    async predictBestRoute(symbol: string, quantity: number, side: string): Promise<string> {
        // In production, this would use ML model to predict best route
        const venues = await this.getMarketData(symbol);

        if (venues.length === 0) return 'DEFAULT';

        // Simple heuristic: highest liquidity
        const bestVenue = venues.reduce((best, current) =>
            current.liquidity > best.liquidity ? current : best
        );

        return `ROUTE_TO_${bestVenue.name}`;
    }

    /// Estimate execution cost
    async estimateExecutionCost(
        symbol: string,
        quantity: number,
        side: string
    ): Promise<number> {
        const plans = await this.findBestExecution(symbol, quantity, side);

        if (plans.length === 0) return 0;

        // Use best plan
        const bestPlan = plans[0];
        return Math.abs(bestPlan.estimated_price * quantity * (bestPlan.estimated_impact / 100));
    }

    /// Get market data from multiple venues
    private async getMarketData(symbol: string): Promise<Market[]> {
        // Simulated market data
        // In production, this would fetch from real market data APIs
        return [
            {
                name: 'BINANCE',
                symbol,
                bid: 49500,
                ask: 49510,
                liquidity: 5000,
            },
            {
                name: 'COINBASE',
                symbol,
                bid: 49495,
                ask: 49515,
                liquidity: 3000,
            },
            {
                name: 'KRAKEN',
                symbol,
                bid: 49480,
                ask: 49520,
                liquidity: 2000,
            },
        ];
    }
}

export const sorEngine = new SmartOrderRouter();
