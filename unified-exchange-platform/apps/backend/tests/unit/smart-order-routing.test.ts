// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { SmartOrderRouter } from '../../src/services/smart-order-routing';

describe('SmartOrderRouter', () => {
  let router: SmartOrderRouter;

  beforeEach(() => {
    router = new SmartOrderRouter();
  });

  describe('findBestExecution', () => {
    it('should find best execution across venues', async () => {
      const result = await router.findBestExecution({
        symbol: 'BTC-USD',
        side: 'BUY',
        quantity: 1,
      });

      expect(result).toHaveProperty('venue');
      expect(result).toHaveProperty('price');
      expect(result).toHaveProperty('estimatedCost');
      expect(['binance', 'coinbase', 'kraken']).toContain(result.venue);
    });

    it('should split large orders across venues', async () => {
      const result = await router.findBestExecution({
        symbol: 'ETH-USD',
        side: 'BUY',
        quantity: 100,
      });

      if (result.splitExecution) {
        expect(result.splitExecution.length).toBeGreaterThan(1);
        const totalQuantity = result.splitExecution.reduce(
          (sum, exec) => sum + exec.quantity,
          0
        );
        expect(totalQuantity).toBe(100);
      }
    });
  });

  describe('calculateExecutionPlan', () => {
    it('should create execution plan for single venue', () => {
      const plan = router.calculateExecutionPlan({
        venue: 'binance',
        symbol: 'BTC-USD',
        quantity: 1,
        side: 'BUY',
        currentPrice: 50000,
        liquidity: 100,
      });

      expect(plan).toHaveProperty('venue');
      expect(plan).toHaveProperty('quantity');
      expect(plan).toHaveProperty('estimatedPrice');
      expect(plan).toHaveProperty('marketImpact');
    });
  });

  describe('calculateMarketImpact', () => {
    it('should calculate market impact for large order', () => {
      const impact = router.calculateMarketImpact({
        quantity: 50,
        liquidity: 100,
        currentPrice: 3000,
      });

      expect(impact).toBeGreaterThan(0);
      expect(impact).toBeLessThan(10);
    });

    it('should return minimal impact for small order', () => {
      const impact = router.calculateMarketImpact({
        quantity: 1,
        liquidity: 1000,
        currentPrice: 3000,
      });

      expect(impact).toBeLessThan(0.5);
    });
  });

  describe('estimateExecutionCost', () => {
    it('should estimate total execution cost', () => {
      const cost = router.estimateExecutionCost({
        quantity: 10,
        price: 3000,
        marketImpact: 0.5,
        fees: 15,
      });

      expect(cost).toHaveProperty('totalCost');
      expect(cost).toHaveProperty('breakdown');
      expect(cost.totalCost).toBeGreaterThan(30000);
    });
  });
});
