/// Advanced matching engine implementation
/// Handles order matching with priority queues and optimized data structures
use std::collections::VecDeque;
use crate::{Order, Trade, Side, OrderType};
use log::{info, debug};

pub struct MatchingEngine {
    trades: Vec<Trade>,
}

impl MatchingEngine {
    pub fn new() -> Self {
        Self {
            trades: Vec::new(),
        }
    }

    /// Execute matching algorithm with priority handling
    pub fn execute_match(
        buy_orders: &mut VecDeque<Order>,
        sell_orders: &mut VecDeque<Order>,
    ) -> Vec<Trade> {
        let mut trades = Vec::new();

        while let Some(buy_order) = buy_orders.front() {
            if let Some(sell_order) = sell_orders.front() {
                // Check if prices match
                match (&buy_order.order_type, &sell_order.order_type) {
                    (OrderType::Market, _) | (_, OrderType::Market) => {
                        // Market orders always execute
                        if let Some(trade) = Self::create_trade(buy_order, sell_order) {
                            trades.push(trade);
                            buy_orders.pop_front();
                            sell_orders.pop_front();
                        } else {
                            break;
                        }
                    }
                    (OrderType::Limit, _) => {
                        // Limit orders must meet price criteria
                        if let Some(buy_price) = buy_order.price {
                            if let Some(sell_price) = sell_order.price {
                                if buy_price >= sell_price {
                                    if let Some(trade) = Self::create_trade(buy_order, sell_order) {
                                        trades.push(trade);
                                        buy_orders.pop_front();
                                        sell_orders.pop_front();
                                    } else {
                                        break;
                                    }
                                } else {
                                    break;
                                }
                            } else {
                                break;
                            }
                        } else {
                            break;
                        }
                    }
                    _ => break,
                }
            } else {
                break;
            }
        }

        trades
    }

    /// Create a trade from two matching orders
    fn create_trade(buy_order: &Order, sell_order: &Order) -> Option<Trade> {
        let quantity = buy_order.quantity.min(sell_order.quantity);
        let price = (buy_order.price.unwrap_or(0.0) + sell_order.price.unwrap_or(0.0)) / 2.0;

        debug!(
            "Trade executed: {} {} @ ${} (buy_order: {}, sell_order: {})",
            buy_order.symbol, quantity, price, buy_order.id, sell_order.id
        );

        Some(Trade {
            id: uuid::Uuid::new_v4().to_string(),
            buy_order_id: buy_order.id.clone(),
            sell_order_id: sell_order.id.clone(),
            symbol: buy_order.symbol.clone(),
            quantity,
            price,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        })
    }

    /// Validate if a limit order can be matched
    pub fn can_match_limit_order(buy_price: f64, sell_price: f64) -> bool {
        buy_price >= sell_price
    }

    /// Calculate mid price for market orders
    pub fn calculate_mid_price(best_bid: f64, best_ask: f64) -> f64 {
        (best_bid + best_ask) / 2.0
    }

    /// Calculate volume-weighted average price (VWAP)
    pub fn calculate_vwap(prices: Vec<(f64, f64)>) -> f64 {
        let total_volume: f64 = prices.iter().map(|(_, v)| v).sum();
        if total_volume == 0.0 {
            return 0.0;
        }

        let numerator: f64 = prices.iter().map(|(p, v)| p * v).sum();
        numerator / total_volume
    }

    /// Calculate time-weighted average price (TWAP)
    pub fn calculate_twap(prices: Vec<(f64, u64)>) -> f64 {
        let total_time: u64 = prices.iter().map(|(_, t)| t).sum();
        if total_time == 0 {
            return 0.0;
        }

        let numerator: f64 = prices.iter().map(|(p, t)| p * *t as f64).sum();
        numerator / total_time as f64
    }

    /// Check if order can be partially filled
    pub fn can_partial_fill(total_quantity: f64, available_quantity: f64) -> bool {
        available_quantity > 0.0 && available_quantity < total_quantity
    }

    /// Get matching statistics
    pub fn get_statistics(trades: &[Trade]) -> MatchingStats {
        if trades.is_empty() {
            return MatchingStats::default();
        }

        let total_volume: f64 = trades.iter().map(|t| t.quantity).sum();
        let total_value: f64 = trades.iter().map(|t| t.quantity * t.price).sum();
        let avg_price = total_value / total_volume;
        let min_price = trades
            .iter()
            .map(|t| t.price)
            .fold(f64::INFINITY, f64::min);
        let max_price = trades
            .iter()
            .map(|t| t.price)
            .fold(f64::NEG_INFINITY, f64::max);

        MatchingStats {
            total_trades: trades.len(),
            total_volume,
            total_value,
            avg_price,
            min_price,
            max_price,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct MatchingStats {
    pub total_trades: usize,
    pub total_volume: f64,
    pub total_value: f64,
    pub avg_price: f64,
    pub min_price: f64,
    pub max_price: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_can_match_limit_orders() {
        assert!(MatchingEngine::can_match_limit_order(100.0, 99.0));
        assert!(!MatchingEngine::can_match_limit_order(98.0, 99.0));
    }

    #[test]
    fn test_mid_price_calculation() {
        let mid = MatchingEngine::calculate_mid_price(100.0, 102.0);
        assert_eq!(mid, 101.0);
    }

    #[test]
    fn test_vwap_calculation() {
        let prices = vec![(100.0, 10.0), (102.0, 20.0)];
        let vwap = MatchingEngine::calculate_vwap(prices);
        assert!((vwap - 101.333).abs() < 0.01);
    }
}
