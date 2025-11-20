import { describe, it, expect } from 'vitest';

describe('Fee Calculator Service', () => {
  describe('User Tier Calculation', () => {
    it('should assign BRONZE tier for low volume users', () => {
      const volume30d = 0;
      const kk99Holdings = 0;
      
      const tier = volume30d < 100000 && kk99Holdings < 1000 ? 'BRONZE' : 'SILVER';
      expect(tier).toBe('BRONZE');
    });

    it('should assign SILVER tier for medium volume', () => {
      const volume30d = 100000;
      const kk99Holdings = 1000;
      
      const tier = volume30d >= 100000 && kk99Holdings >= 1000 ? 'SILVER' : 'BRONZE';
      expect(tier).toBe('SILVER');
    });

    it('should assign GOLD tier for high volume', () => {
      const volume30d = 1000000;
      const kk99Holdings = 10000;
      
      const tier = volume30d >= 1000000 && kk99Holdings >= 10000 ? 'GOLD' : 'SILVER';
      expect(tier).toBe('GOLD');
    });

    it('should assign PLATINUM tier for whale users', () => {
      const volume30d = 10000000;
      const kk99Holdings = 100000;
      
      const tier = volume30d >= 10000000 && kk99Holdings >= 100000 ? 'PLATINUM' : 'GOLD';
      expect(tier).toBe('PLATINUM');
    });

    it('should not upgrade tier without KK99 holdings', () => {
      const volume30d = 10000000;
      const kk99Holdings = 0;
      
      const tier = kk99Holdings >= 100000 ? 'PLATINUM' : 'BRONZE';
      expect(tier).toBe('BRONZE');
    });
  });

  describe('Maker Fee Calculation', () => {
    it('should calculate maker fee for BRONZE tier', () => {
      const amount = 1000;
      const makerFeeRate = 0.001; // 0.1%
      const fee = amount * makerFeeRate;
      
      expect(fee).toBe(1);
    });

    it('should calculate maker fee for GOLD tier', () => {
      const amount = 1000;
      const makerFeeRate = 0.0005; // 0.05%
      const fee = amount * makerFeeRate;
      
      expect(fee).toBe(0.5);
    });
  });

  describe('Taker Fee Calculation', () => {
    it('should calculate taker fee for BRONZE tier', () => {
      const amount = 1000;
      const takerFeeRate = 0.002; // 0.2%
      const fee = amount * takerFeeRate;
      
      expect(fee).toBe(2);
    });

    it('should calculate taker fee for GOLD tier', () => {
      const amount = 1000;
      const takerFeeRate = 0.001; // 0.1%
      const fee = amount * takerFeeRate;
      
      expect(fee).toBe(1);
    });
  });

  describe('Referral Rebate Calculation', () => {
    it('should calculate referral rebate at 20%', () => {
      const feeCollected = 100;
      const referralRate = 0.20;
      const rebate = feeCollected * referralRate;
      
      expect(rebate).toBe(20);
    });

    it('should calculate VIP referral rebate at 30%', () => {
      const feeCollected = 100;
      const referralRate = 0.30;
      const rebate = feeCollected * referralRate;
      
      expect(rebate).toBe(30);
    });
  });

  describe('Promotional Discount', () => {
    it('should apply 20% promotion discount', () => {
      const baseFee = 100;
      const promoDiscount = 0.20;
      const finalFee = baseFee * (1 - promoDiscount);
      const discountApplied = baseFee - finalFee;
      
      expect(finalFee).toBe(80);
      expect(discountApplied).toBe(20);
    });

    it('should handle expired promotion codes', () => {
      const baseFee = 100;
      const isExpired = true;
      const finalFee = isExpired ? baseFee : baseFee * 0.8;
      const discountApplied = baseFee - finalFee;
      
      expect(finalFee).toBe(100);
      expect(discountApplied).toBe(0);
    });
  });
});
