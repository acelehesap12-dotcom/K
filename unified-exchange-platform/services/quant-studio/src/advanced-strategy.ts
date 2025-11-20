import axios from 'axios';
import { logger } from '../utils/logger.js';

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeSignal {
  type: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  price: number;
  reason: string;
}

export interface BacktestResult {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  tradeCount: number;
  avgWin: number;
  avgLoss: number;
}

/**
 * Advanced Multi-Strategy Trading System
 */
export class StrategyEngine {
  private baseUrl: string;
  private symbol: string;

  constructor(baseUrl: string = 'http://localhost:3001', symbol: string = 'BTC-USD') {
    this.baseUrl = baseUrl;
    this.symbol = symbol;
  }

  /**
   * Simple Moving Average Crossover (EMA)
   */
  async generateSMASignal(fastPeriod: number = 12, slowPeriod: number = 26): Promise<TradeSignal> {
    try {
      const candles = await this.getCandles(slowPeriod + 10);

      const fastEMA = this.calculateEMA(candles.map((c) => c.close), fastPeriod);
      const slowEMA = this.calculateEMA(candles.map((c) => c.close), slowPeriod);

      const lastFast = fastEMA[fastEMA.length - 1];
      const lastSlow = slowEMA[slowEMA.length - 1];
      const prevFast = fastEMA[fastEMA.length - 2];
      const prevSlow = slowEMA[slowEMA.length - 2];

      const currentPrice = candles[candles.length - 1].close;

      if (prevFast <= prevSlow && lastFast > lastSlow) {
        return {
          type: 'BUY',
          confidence: 0.75,
          price: currentPrice,
          reason: `EMA${fastPeriod} crossed above EMA${slowPeriod}`,
        };
      }

      if (prevFast >= prevSlow && lastFast < lastSlow) {
        return {
          type: 'SELL',
          confidence: 0.75,
          price: currentPrice,
          reason: `EMA${fastPeriod} crossed below EMA${slowPeriod}`,
        };
      }

      return {
        type: 'HOLD',
        confidence: 0.5,
        price: currentPrice,
        reason: 'No crossover signal',
      };
    } catch (error) {
      logger.error('SMA strategy error:', error);
      return {
        type: 'HOLD',
        confidence: 0,
        price: 0,
        reason: 'Error calculating signal',
      };
    }
  }

  /**
   * Relative Strength Index (RSI)
   */
  async generateRSISignal(period: number = 14, oversoldLevel: number = 30, overboughtLevel: number = 70): Promise<TradeSignal> {
    try {
      const candles = await this.getCandles(period + 10);
      const closes = candles.map((c) => c.close);

      const rsi = this.calculateRSI(closes, period);
      const currentRSI = rsi[rsi.length - 1];
      const currentPrice = closes[closes.length - 1];

      if (currentRSI < oversoldLevel) {
        return {
          type: 'BUY',
          confidence: 0.65,
          price: currentPrice,
          reason: `RSI ${currentRSI.toFixed(2)} indicates oversold condition`,
        };
      }

      if (currentRSI > overboughtLevel) {
        return {
          type: 'SELL',
          confidence: 0.65,
          price: currentPrice,
          reason: `RSI ${currentRSI.toFixed(2)} indicates overbought condition`,
        };
      }

      return {
        type: 'HOLD',
        confidence: 0.5,
        price: currentPrice,
        reason: 'RSI in neutral zone',
      };
    } catch (error) {
      logger.error('RSI strategy error:', error);
      return {
        type: 'HOLD',
        confidence: 0,
        price: 0,
        reason: 'Error calculating RSI',
      };
    }
  }

  /**
   * Bollinger Bands Strategy
   */
  async generateBollingerBandsSignal(period: number = 20, stdDev: number = 2): Promise<TradeSignal> {
    try {
      const candles = await this.getCandles(period + 10);
      const closes = candles.map((c) => c.close);

      const sma = this.calculateSMA(closes, period);
      const lastSMA = sma[sma.length - 1];

      const variance = closes.slice(-period).reduce((sum, price) => {
        return sum + Math.pow(price - lastSMA, 2);
      }, 0) / period;

      const standardDev = Math.sqrt(variance);
      const upperBand = lastSMA + stdDev * standardDev;
      const lowerBand = lastSMA - stdDev * standardDev;

      const currentPrice = closes[closes.length - 1];

      if (currentPrice < lowerBand) {
        return {
          type: 'BUY',
          confidence: 0.7,
          price: currentPrice,
          reason: `Price ${currentPrice.toFixed(2)} below lower Bollinger Band ${lowerBand.toFixed(2)}`,
        };
      }

      if (currentPrice > upperBand) {
        return {
          type: 'SELL',
          confidence: 0.7,
          price: currentPrice,
          reason: `Price ${currentPrice.toFixed(2)} above upper Bollinger Band ${upperBand.toFixed(2)}`,
        };
      }

      return {
        type: 'HOLD',
        confidence: 0.5,
        price: currentPrice,
        reason: 'Price within Bollinger Bands',
      };
    } catch (error) {
      logger.error('Bollinger Bands strategy error:', error);
      return {
        type: 'HOLD',
        confidence: 0,
        price: 0,
        reason: 'Error calculating Bollinger Bands',
      };
    }
  }

  /**
   * Combined Strategy with Voting System
   */
  async generateCombinedSignal(): Promise<TradeSignal> {
    try {
      const signals = await Promise.all([
        this.generateSMASignal(12, 26),
        this.generateRSISignal(14, 30, 70),
        this.generateBollingerBandsSignal(20, 2),
      ]);

      const buyVotes = signals.filter((s) => s.type === 'BUY').length;
      const sellVotes = signals.filter((s) => s.type === 'SELL').length;
      const confidence = Math.max(...signals.map((s) => s.confidence));

      let type: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let reason = 'No consensus from strategies';

      if (buyVotes > sellVotes && buyVotes >= 2) {
        type = 'BUY';
        reason = `${buyVotes}/3 strategies signal BUY`;
      } else if (sellVotes > buyVotes && sellVotes >= 2) {
        type = 'SELL';
        reason = `${sellVotes}/3 strategies signal SELL`;
      }

      return {
        type,
        confidence: confidence * (buyVotes + sellVotes) / 3,
        price: signals[0].price,
        reason,
      };
    } catch (error) {
      logger.error('Combined strategy error:', error);
      return {
        type: 'HOLD',
        confidence: 0,
        price: 0,
        reason: 'Error in combined strategy',
      };
    }
  }

  /**
   * Calculate Simple Moving Average
   */
  private calculateSMA(prices: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        result.push(0);
      } else {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }
    return result;
  }

  /**
   * Calculate Exponential Moving Average
   */
  private calculateEMA(prices: number[], period: number): number[] {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);

    const sma = this.calculateSMA(prices, period);
    let ema = sma[period - 1];
    result.push(ema);

    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * multiplier + ema * (1 - multiplier);
      result.push(ema);
    }

    return result;
  }

  /**
   * Calculate Relative Strength Index
   */
  private calculateRSI(prices: number[], period: number): number[] {
    const result: number[] = [];
    const changes: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
    }

    avgGain /= period;
    avgLoss /= period;

    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      if (change > 0) avgGain = (avgGain * (period - 1) + change) / period;
      else avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;

      const rs = avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);
      result.push(rsi);
    }

    return result;
  }

  /**
   * Backtest strategy on historical data
   */
  async backtest(
    startDate: Date,
    endDate: Date,
    initialCapital: number = 10000,
  ): Promise<BacktestResult> {
    try {
      const candles = await this.getHistoricalCandles(startDate, endDate);

      let capital = initialCapital;
      let position = 0;
      let trades = 0;
      let wins = 0;
      const trades_list: number[] = [];
      const equityCurve: number[] = [initialCapital];

      for (const candle of candles) {
        const signal = await this.generateCombinedSignal();

        if (signal.type === 'BUY' && position === 0) {
          position = capital / signal.price;
          capital = 0;
          trades++;
        } else if (signal.type === 'SELL' && position > 0) {
          const exitPrice = signal.price;
          const profit = position * exitPrice;

          if (profit > capital) wins++;

          trades_list.push(profit - capital);
          capital = profit;
          position = 0;
          trades++;
        }

        equityCurve.push(capital + position * candle.close);
      }

      if (position > 0) {
        capital += position * candles[candles.length - 1].close;
      }

      const totalReturn = (capital - initialCapital) / initialCapital;
      const sharpeRatio = this.calculateSharpeRatio(equityCurve);
      const maxDrawdown = this.calculateMaxDrawdown(equityCurve);
      const winRate = trades > 0 ? wins / (trades / 2) : 0;
      const avgWin = trades_list.filter((t) => t > 0).reduce((a, b) => a + b, 0) / Math.max(wins, 1);
      const avgLoss =
        trades_list.filter((t) => t < 0).reduce((a, b) => a + b, 0) / Math.max(trades / 2 - wins, 1);

      return {
        totalReturn,
        sharpeRatio,
        maxDrawdown,
        winRate,
        tradeCount: trades,
        avgWin,
        avgLoss,
      };
    } catch (error) {
      logger.error('Backtest error:', error);
      throw error;
    }
  }

  /**
   * Calculate Sharpe Ratio
   */
  private calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.02): number {
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return (meanReturn - riskFreeRate) / stdDev;
  }

  /**
   * Calculate Max Drawdown
   */
  private calculateMaxDrawdown(equityCurve: number[]): number {
    let maxDrawdown = 0;
    let peak = equityCurve[0];

    for (const equity of equityCurve) {
      if (equity > peak) peak = equity;
      const drawdown = (peak - equity) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return maxDrawdown;
  }

  /**
   * Fetch candle data
   */
  private async getCandles(limit: number = 100): Promise<OHLCV[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/market/candles`, {
        params: {
          symbol: this.symbol,
          interval: '1h',
          limit,
        },
      });

      return response.data.data;
    } catch (error) {
      logger.error('Error fetching candles:', error);
      throw error;
    }
  }

  /**
   * Fetch historical candles
   */
  private async getHistoricalCandles(startDate: Date, endDate: Date): Promise<OHLCV[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/market/candles`, {
        params: {
          symbol: this.symbol,
          interval: '1d',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });

      return response.data.data;
    } catch (error) {
      logger.error('Error fetching historical candles:', error);
      throw error;
    }
  }
}

/**
 * Example usage
 */
export async function runStrategy() {
  const engine = new StrategyEngine();

  // Generate signal
  const signal = await engine.generateCombinedSignal();
  logger.info('Trade Signal:', signal);

  // Backtest
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days

  try {
    const result = await engine.backtest(startDate, endDate, 10000);
    logger.info('Backtest Result:', result);
  } catch (error) {
    logger.error('Backtest failed:', error);
  }
}
