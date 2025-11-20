// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { ComplianceService } from '../../src/services/compliance';

describe('ComplianceService', () => {
  let service: ComplianceService;

  beforeEach(() => {
    service = new ComplianceService();
  });

  describe('runAmlKycCheck', () => {
    it('should pass clean user through AML check', async () => {
      const result = await service.runAmlKycCheck({
        userId: 'user-clean',
        name: 'John Doe',
        country: 'US',
        identityDocuments: ['passport-123'],
      });

      expect(result.passed).toBe(true);
      expect(result.riskScore).toBeLessThan(50);
      expect(result.flags).toHaveLength(0);
    });

    it('should flag sanctioned countries', async () => {
      const result = await service.runAmlKycCheck({
        userId: 'user-sanctioned',
        name: 'Test User',
        country: 'KP', // North Korea
        identityDocuments: ['passport-456'],
      });

      expect(result.passed).toBe(false);
      expect(result.flags).toContain('SANCTIONED_COUNTRY');
    });

    it('should flag high-risk countries', async () => {
      const result = await service.runAmlKycCheck({
        userId: 'user-highrisk',
        name: 'Test User',
        country: 'IR', // Iran
        identityDocuments: ['passport-789'],
      });

      expect(result.riskScore).toBeGreaterThan(70);
    });
  });

  describe('checkSanctionsList', () => {
    it('should check against OFAC list', async () => {
      const result = await service.checkSanctionsList({
        name: 'John Doe',
        country: 'US',
        lists: ['OFAC'],
      });

      expect(result).toHaveProperty('matched');
      expect(result).toHaveProperty('lists');
    });

    it('should check multiple sanctions lists', async () => {
      const result = await service.checkSanctionsList({
        name: 'Test User',
        country: 'GB',
        lists: ['OFAC', 'EU', 'UN'],
      });

      expect(result.lists.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('enforcePositionLimits', () => {
    it('should allow positions within limits', () => {
      const result = service.enforcePositionLimits({
        userId: 'user-1',
        symbol: 'BTC-USD',
        newPosition: 5,
        currentPosition: 0,
        dailyVolume: 10000,
        maxPositionPercent: 10,
      });

      expect(result.allowed).toBe(true);
    });

    it('should block positions exceeding limits', () => {
      const result = service.enforcePositionLimits({
        userId: 'user-2',
        symbol: 'BTC-USD',
        newPosition: 2000,
        currentPosition: 0,
        dailyVolume: 10000,
        maxPositionPercent: 10,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds');
    });
  });

  describe('detectAnomalies', () => {
    it('should detect wash trading', () => {
      const trades = [
        { userId: 'user-1', side: 'BUY', quantity: 10, price: 100, timestamp: Date.now() },
        { userId: 'user-1', side: 'SELL', quantity: 10, price: 100, timestamp: Date.now() + 1000 },
      ];

      const anomalies = service.detectAnomalies(trades);

      expect(anomalies.washTrading).toBe(true);
    });

    it('should detect spoofing', () => {
      const orders = [
        { orderId: '1', quantity: 1000, price: 100, cancelled: true, cancelledAt: Date.now() + 2000 },
      ];

      const anomalies = service.detectAnomalies([], orders);

      expect(anomalies.spoofing).toBe(true);
    });

    it('should detect rapid order cancellation', () => {
      const orders = Array.from({ length: 60 }, (_, i) => ({
        orderId: `order-${i}`,
        quantity: 1,
        price: 100,
        cancelled: true,
        cancelledAt: Date.now() + i * 1000,
      }));

      const anomalies = service.detectAnomalies([], orders);

      expect(anomalies.rapidCancellation).toBe(true);
    });
  });

  describe('generateRegulatoryReport', () => {
    it('should generate SEC report format', async () => {
      const report = await service.generateRegulatoryReport({
        reportType: 'SEC',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      });

      expect(report).toHaveProperty('reportType');
      expect(report).toHaveProperty('totalTrades');
      expect(report).toHaveProperty('totalVolume');
      expect(report.reportType).toBe('SEC');
    });

    it('should generate CFTC report for derivatives', async () => {
      const report = await service.generateRegulatoryReport({
        reportType: 'CFTC',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      });

      expect(report).toHaveProperty('derivativesVolume');
      expect(report.reportType).toBe('CFTC');
    });
  });
});
