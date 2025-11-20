// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { FeeCalculator } from '../../src/services/fee-calculator';

describe('FeeCalculator', () => {
  let calculator: FeeCalculator;

  beforeEach(() => {
    calculator = new FeeCalculator();
  });

  describe('calculateUserTier', () => {
    it('should assign BRONZE tier for new users', () => {
      const tier = calculator.calculateUserTier({
        userId: 'user-1',
        volume30d: 0,
        kk99Holdings: 0,
      });

      expect(tier).toBe('BRONZE');
    });

    it('should assign SILVER tier for 100K volume', () => {
      const tier = calculator.calculateUserTier({
        userId: 'user-2',
        volume30d: 100000,
        kk99Holdings: 1000,
      });

      expect(tier).toBe('SILVER');
    });

    it('should assign GOLD tier for 1M volume and 10K KK99', () => {
      const tier = calculator.calculateUserTier({
        userId: 'user-3',
        volume30d: 1000000,
        kk99Holdings: 10000,
      });

      expect(tier).toBe('GOLD');
    });

    it('should assign PLATINUM tier for 10M volume and 100K KK99', () => {
      const tier = calculator.calculateUserTier({
        userId: 'user-4',
        volume30d: 10000000,
        kk99Holdings: 100000,
      });

      expect(tier).toBe('PLATINUM');
    });

    it('should require both volume and KK99 holdings for tier upgrade', () => {
      const tier = calculator.calculateUserTier({
        userId: 'user-5',
        volume30d: 10000000,
        kk99Holdings: 0, // No KK99 holdings
      });

      expect(tier).not.toBe('PLATINUM');
    });
  });

  describe('calculateMakerFee', () => {
    it('should calculate BRONZE tier maker fee', () => {
      const fee = calculator.calculateMakerFee({
        amount: 10000,
        tier: 'BRONZE',
      });

      expect(fee).toBe(5); // 0.05% of 10000
    });

    it('should calculate PLATINUM tier maker fee', () => {
      const fee = calculator.calculateMakerFee({
        amount: 10000,
        tier: 'PLATINUM',
      });

      expect(fee).toBe(1); // 0.01% of 10000
    });
  });

  describe('calculateTakerFee', () => {
    it('should calculate BRONZE tier taker fee', () => {
      const fee = calculator.calculateTakerFee({
        amount: 10000,
        tier: 'BRONZE',
      });

      expect(fee).toBe(10); // 0.10% of 10000
    });

    it('should calculate GOLD tier taker fee with discount', () => {
      const fee = calculator.calculateTakerFee({
        amount: 10000,
        tier: 'GOLD',
      });

      expect(fee).toBe(5); // 0.05% of 10000
    });
  });

  describe('calculateReferralRebate', () => {
    it('should give 5% rebate for BRONZE tier', () => {
      const rebate = calculator.calculateReferralRebate({
        fee: 100,
        tier: 'BRONZE',
      });

      expect(rebate).toBe(5);
    });

    it('should give 20% rebate for PLATINUM tier', () => {
      const rebate = calculator.calculateReferralRebate({
        fee: 100,
        tier: 'PLATINUM',
      });

      expect(rebate).toBe(20);
    });
  });

  describe('applyPromotion', () => {
    it('should apply LAUNCH20 promotion correctly', () => {
      const result = calculator.applyPromotion({
        baseFee: 100,
        promoCode: 'LAUNCH20',
      });

      expect(result.finalFee).toBe(80);
      expect(result.discountApplied).toBe(20);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid promo code', () => {
      const result = calculator.applyPromotion({
        baseFee: 100,
        promoCode: 'INVALID',
      });

      expect(result.finalFee).toBe(100);
      expect(result.discountApplied).toBe(0);
      expect(result.valid).toBe(false);
    });
  });
});
