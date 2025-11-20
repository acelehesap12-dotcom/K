import Decimal from 'decimal.js';
import axios from 'axios';

interface Trade {
  timestamp: Date;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: Decimal;
  quantity: Decimal;
}

interface BacktestResult {
  totalReturn: Decimal;
  sharpeRatio: Decimal;
  maxDrawdown: Decimal;
  winRate: number;
  trades: Trade[];
}

export class QuantStrategy {
  public trades: Trade[] = [];
  public portfolio: Map<string, Decimal> = new Map();

  async fetchHistoricalData(symbol: string, startDate: Date, endDate: Date) {
    try {
      const response = await axios.get(
        `http://localhost:3001/api/v1/market/${symbol}/candles`,
        {
          params: {
            interval: '1d',
            limit: 365,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Failed to fetch data:', error);
      throw error;
    }
  }

  // Simple SMA crossover strategy
  async smaStrategy(symbol: string, fastPeriod: number = 50, slowPeriod: number = 200) {
    const data = await this.fetchHistoricalData(symbol, new Date('2024-01-01'), new Date('2024-12-31'));

    let fastSMA: Decimal[] = [];
    let slowSMA: Decimal[] = [];

    // Calculate SMAs
    for (let i = 0; i < data.length; i++) {
      if (i >= fastPeriod - 1) {
        const fastSum = data
          .slice(i - fastPeriod + 1, i + 1)
          .reduce((sum: Decimal, d: any) => sum.plus(new Decimal(d.close)), new Decimal(0));
        fastSMA[i] = fastSum.dividedBy(fastPeriod);
      }

      if (i >= slowPeriod - 1) {
        const slowSum = data
          .slice(i - slowPeriod + 1, i + 1)
          .reduce((sum: Decimal, d: any) => sum.plus(new Decimal(d.close)), new Decimal(0));
        slowSMA[i] = slowSum.dividedBy(slowPeriod);
      }
    }

    // Generate signals
    for (let i = slowPeriod; i < data.length; i++) {
      if (fastSMA[i] && slowSMA[i]) {
        if (fastSMA[i].greaterThan(slowSMA[i]) && !this.hasOpenPosition(symbol)) {
          // Buy signal
          this.trades.push({
            timestamp: new Date(data[i].time),
            symbol,
            side: 'BUY',
            price: new Decimal(data[i].close),
            quantity: new Decimal(1),
          });
        } else if (fastSMA[i].lessThan(slowSMA[i]) && this.hasOpenPosition(symbol)) {
          // Sell signal
          this.trades.push({
            timestamp: new Date(data[i].time),
            symbol,
            side: 'SELL',
            price: new Decimal(data[i].close),
            quantity: new Decimal(1),
          });
        }
      }
    }

    return this.calculateStats();
  }

  private hasOpenPosition(symbol: string): boolean {
    const position = this.portfolio.get(symbol);
    return position ? position.greaterThan(0) : false;
  }

  private calculateStats(): BacktestResult {
    let totalReturn = new Decimal(0);
    let tradeCount = 0;
    let winCount = 0;

    const returns: Decimal[] = [];

    for (let i = 0; i < this.trades.length; i += 2) {
      if (i + 1 < this.trades.length) {
        const buyTrade = this.trades[i];
        const sellTrade = this.trades[i + 1];

        if (buyTrade.side === 'BUY' && sellTrade.side === 'SELL') {
          const profit = sellTrade.price.minus(buyTrade.price).times(buyTrade.quantity);
          totalReturn = totalReturn.plus(profit);

          if (profit.greaterThan(0)) {
            winCount++;
          }

          returns.push(profit);
          tradeCount++;
        }
      }
    }

    const sharpeRatio = this.calculateSharpeRatio(returns);
    const maxDrawdown = this.calculateMaxDrawdown(returns);

    return {
      totalReturn,
      sharpeRatio,
      maxDrawdown,
      winRate: tradeCount > 0 ? (winCount / tradeCount) * 100 : 0,
      trades: this.trades,
    };
  }

  private calculateSharpeRatio(returns: Decimal[]): Decimal {
    if (returns.length === 0) return new Decimal(0);

    const mean = returns.reduce((sum, r) => sum.plus(r), new Decimal(0)).dividedBy(returns.length);

    const variance = returns
      .reduce((sum, r) => sum.plus(r.minus(mean).pow(2)), new Decimal(0))
      .dividedBy(returns.length);

    const stdDev = variance.sqrt();
    const riskFreeRate = new Decimal(0.02).dividedBy(252); // Assuming 252 trading days

    return mean.dividedBy(stdDev).minus(riskFreeRate);
  }

  private calculateMaxDrawdown(returns: Decimal[]): Decimal {
    let maxEquity = new Decimal(100000); // Starting balance
    let maxDrawdown = new Decimal(0);
    let equity = new Decimal(100000);

    for (const ret of returns) {
      equity = equity.plus(ret);
      if (equity.greaterThan(maxEquity)) {
        maxEquity = equity;
      }

      const drawdown = maxEquity.minus(equity).dividedBy(maxEquity);
      if (drawdown.greaterThan(maxDrawdown)) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }
}

// Usage
const strategy = new QuantStrategy();
await strategy.smaStrategy('BTC-USD');
