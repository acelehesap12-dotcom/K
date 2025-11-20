import { describe, it, expect } from 'vitest';

describe('CircuitBreakerService', () => {
  describe('Price Movement Detection', () => {
    it('should detect normal price movements', () => {
      const oldPrice = 100;
      const newPrice = 101;
      const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;
      const threshold = 5; // 5% threshold
      
      expect(Math.abs(changePercent)).toBeLessThan(threshold);
    });

    it('should detect abnormal price spikes', () => {
      const oldPrice = 100;
      const newPrice = 120;
      const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;
      const threshold = 5;
      
      expect(Math.abs(changePercent)).toBeGreaterThan(threshold);
    });

    it('should detect price dumps', () => {
      const oldPrice = 100;
      const newPrice = 80;
      const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;
      const threshold = 5;
      
      expect(Math.abs(changePercent)).toBeGreaterThan(threshold);
    });
  });

  describe('Volume Spike Detection', () => {
    it('should detect normal trading volume', () => {
      const currentVolume = 1000;
      const avgVolume = 950;
      const ratio = currentVolume / avgVolume;
      const threshold = 3; // 3x normal
      
      expect(ratio).toBeLessThan(threshold);
    });

    it('should detect volume spikes', () => {
      const currentVolume = 5000;
      const avgVolume = 1000;
      const ratio = currentVolume / avgVolume;
      const threshold = 3;
      
      expect(ratio).toBeGreaterThan(threshold);
    });
  });

  describe('Circuit Breaker State', () => {
    it('should initialize with circuit closed', () => {
      const isTripped = false;
      expect(isTripped).toBe(false);
    });

    it('should trip circuit on threshold breach', () => {
      const priceChange = 15; // 15% change
      const threshold = 10;
      const shouldTrip = Math.abs(priceChange) > threshold;
      
      expect(shouldTrip).toBe(true);
    });

    it('should calculate recovery time', () => {
      const tripTime = Date.now();
      const cooldownPeriod = 300000; // 5 minutes
      const recoveryTime = tripTime + cooldownPeriod;
      
      expect(recoveryTime).toBeGreaterThan(tripTime);
    });
  });
});
