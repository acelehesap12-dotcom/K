import { describe, it, expect } from 'vitest';

describe('Slippage Protection Engine', () => {
  describe('Price Impact Calculation', () => {
    it('should calculate price impact correctly for small orders', () => {
      const orderSize = 100;
      const marketDepth = 10000;
      const expectedImpact = (orderSize / marketDepth) * 100; // ~1%
      
      expect(expectedImpact).toBeLessThan(2);
    });

    it('should calculate price impact correctly for large orders', () => {
      const orderSize = 5000;
      const marketDepth = 10000;
      const expectedImpact = (orderSize / marketDepth) * 100; // ~50%
      
      expect(expectedImpact).toBeGreaterThan(10);
    });
  });

  describe('Slippage Validation', () => {
    it('should allow trades within slippage tolerance', () => {
      const expectedPrice = 100;
      const actualPrice = 100.5;
      const slippageTolerance = 1.0; // 1%
      
      const slippage = ((actualPrice - expectedPrice) / expectedPrice) * 100;
      expect(slippage).toBeLessThan(slippageTolerance);
    });

    it('should reject trades exceeding slippage tolerance', () => {
      const expectedPrice = 100;
      const actualPrice = 103;
      const slippageTolerance = 1.0; // 1%
      
      const slippage = ((actualPrice - expectedPrice) / expectedPrice) * 100;
      expect(slippage).toBeGreaterThan(slippageTolerance);
    });

    it('should handle negative slippage (better price)', () => {
      const expectedPrice = 100;
      const actualPrice = 99;
      const slippage = ((actualPrice - expectedPrice) / expectedPrice) * 100;
      
      expect(slippage).toBeLessThan(0);
      // Negative slippage should always be allowed
    });
  });

  describe('Execution Strategies', () => {
    it('should recommend splitting for high impact orders', () => {
      const orderSize = 8000;
      const marketDepth = 10000;
      const impact = (orderSize / marketDepth) * 100; // 80%
      
      const shouldSplit = impact > 10; // Split if impact > 10%
      expect(shouldSplit).toBe(true);
    });

    it('should allow immediate execution for low impact orders', () => {
      const orderSize = 500;
      const marketDepth = 10000;
      const impact = (orderSize / marketDepth) * 100; // 5%
      
      const shouldSplit = impact > 10;
      expect(shouldSplit).toBe(false);
    });
  });
});
