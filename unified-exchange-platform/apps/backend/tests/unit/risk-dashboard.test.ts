// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { RiskDashboardService } from '../../src/services/risk-dashboard';

describe('RiskDashboardService', () => {
  let service: RiskDashboardService;

  beforeEach(() => {
    service = new RiskDashboardService();
  });

  describe('calculatePortfolioVaR', () => {
    it('should calculate 95% VaR correctly', async () => {
      const var95 = await service.calculatePortfolioVaR({
        userId: 'user-1',
        positions: [
          { symbol: 'BTC-USD', quantity: 1, currentPrice: 50000 },
          { symbol: 'ETH-USD', quantity: 10, currentPrice: 3000 },
        ],
        confidence: 0.95,
        timeHorizon: 1,
      });

      expect(var95).toBeGreaterThan(0);
      expect(var95).toBeLessThan(80000); // Total portfolio value
    });

    it('should calculate 99% VaR correctly', async () => {
      const var99 = await service.calculatePortfolioVaR({
        userId: 'user-1',
        positions: [
          { symbol: 'BTC-USD', quantity: 1, currentPrice: 50000 },
        ],
        confidence: 0.99,
        timeHorizon: 1,
      });

      expect(var99).toBeGreaterThan(0);
    });

    it('should handle empty portfolio', async () => {
      const var95 = await service.calculatePortfolioVaR({
        userId: 'user-2',
        positions: [],
        confidence: 0.95,
        timeHorizon: 1,
      });

      expect(var95).toBe(0);
    });
  });

  describe('calculateGreeks', () => {
    it('should calculate option Greeks correctly', () => {
      const greeks = service.calculateGreeks({
        optionType: 'CALL',
        spotPrice: 50000,
        strikePrice: 55000,
        timeToExpiry: 30, // days
        volatility: 0.6,
        riskFreeRate: 0.05,
      });

      expect(greeks).toHaveProperty('delta');
      expect(greeks).toHaveProperty('gamma');
      expect(greeks).toHaveProperty('vega');
      expect(greeks).toHaveProperty('theta');
      expect(greeks.delta).toBeGreaterThan(0);
      expect(greeks.delta).toBeLessThan(1);
    });

    it('should calculate PUT option Greeks', () => {
      const greeks = service.calculateGreeks({
        optionType: 'PUT',
        spotPrice: 50000,
        strikePrice: 45000,
        timeToExpiry: 30,
        volatility: 0.6,
        riskFreeRate: 0.05,
      });

      expect(greeks.delta).toBeLessThan(0);
      expect(greeks.delta).toBeGreaterThan(-1);
    });
  });

  describe('calculateMarginRequirement', () => {
    it('should calculate SPAN margin for futures', () => {
      const margin = service.calculateMarginRequirement({
        symbol: 'BTC-PERP',
        quantity: 10,
        price: 50000,
        leverage: 10,
      });

      expect(margin).toBeGreaterThan(0);
      expect(margin).toBeLessThan(500000); // Total position value
    });

    it('should require full collateral for 1x leverage', () => {
      const margin = service.calculateMarginRequirement({
        symbol: 'ETH-PERP',
        quantity: 100,
        price: 3000,
        leverage: 1,
      });

      expect(margin).toBe(300000);
    });
  });

  describe('getLiquidationWarning', () => {
    it('should warn when close to liquidation', () => {
      const warning = service.getLiquidationWarning({
        userId: 'user-1',
        equity: 10000,
        maintenanceMargin: 9000,
      });

      expect(warning.severity).toBe('HIGH');
      expect(warning.shouldAlert).toBe(true);
      expect(warning.marginRatio).toBeLessThan(1.2);
    });

    it('should not warn when well capitalized', () => {
      const warning = service.getLiquidationWarning({
        userId: 'user-2',
        equity: 100000,
        maintenanceMargin: 10000,
      });

      expect(warning.severity).toBe('LOW');
      expect(warning.shouldAlert).toBe(false);
    });
  });
});
