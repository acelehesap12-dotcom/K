/// Advanced Partial Fill Engine for KK99
/// Handles order remainders, re-queueing, and multi-leg fills
use std::collections::{VecDeque, HashMap};
use uuid::Uuid;
use serde::{Deserialize, Serialize};
use log::{info, debug, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartialFillResult {
    pub trade_id: String,
    pub symbol: String,
    pub filled_quantity: f64,
    pub remaining_quantity: f64,
    pub fill_price: f64,
    pub fee_kk99: f64,
    pub timestamp_us: u64,
    pub buy_order_id: String,
    pub sell_order_id: String,
    pub is_partial: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemainderOrder {
    pub original_order_id: String,
    pub remaining_quantity: f64,
    pub price: Option<f64>,
    pub side: String,
    pub symbol: String,
    pub order_type: String,
    pub time_in_force: String,
    pub created_at: u64,
    pub re_queued_at: u64,
    pub re_queue_count: u32,
    pub original_time_priority: u64,
}

#[derive(Debug, Clone)]
pub struct PartialFillTracker {
    pub order_id: String,
    pub total_quantity: f64,
    pub filled_quantity: f64,
    pub fills: Vec<PartialFillResult>,
    pub average_fill_price: f64,
    pub total_fees: f64,
}

pub struct AdvancedPartialFillEngine {
    remainder_orders: HashMap<String, RemainderOrder>,
    fill_trackers: HashMap<String, PartialFillTracker>,
    time_priority_heap: Vec<(u64, String)>, // (timestamp, order_id)
}

impl AdvancedPartialFillEngine {
    pub fn new() -> Self {
        Self {
            remainder_orders: HashMap::new(),
            fill_trackers: HashMap::new(),
            time_priority_heap: Vec::new(),
        }
    }

    /// Execute match with partial fill support
    pub fn execute_match_with_partial_fills(
        &mut self,
        buy_orders: &mut VecDeque<(u64, String, f64, f64, String, f64, String, String)>, // (time_priority, id, price, qty, symbol, fee_rate, order_type, tif)
        sell_orders: &mut VecDeque<(u64, String, f64, f64, String, f64, String, String)>,
    ) -> Vec<PartialFillResult> {
        let mut fills = Vec::new();

        loop {
            // Get next buy order (considering remainders)
            let buy_order = match self.get_next_order(&buy_orders, &self.remainder_orders, "BUY") {
                Some(o) => o,
                None => break,
            };

            // Get next sell order (considering remainders)
            let sell_order = match self.get_next_order(&sell_orders, &self.remainder_orders, "SELL") {
                Some(o) => o,
                None => break,
            };

            // Match prices
            if !self.prices_match(&buy_order, &sell_order) {
                break;
            }

            // Execute partial or full fill
            let fill = self.execute_partial_fill(&buy_order, &sell_order);
            fills.push(fill.clone());

            // Update trackers
            self.update_fill_tracker(&buy_order.1, &fill);
            self.update_fill_tracker(&sell_order.1, &fill);

            // Handle remainders
            if fill.remaining_quantity > 0.0 && fill.remaining_quantity < buy_order.3 {
                self.create_remainder_order(
                    &buy_order.1,
                    fill.remaining_quantity,
                    buy_order.2,
                    "BUY",
                    &buy_order.4,
                    buy_order.0,
                    &buy_order.6,
                    &buy_order.7,
                );
            }

            if fill.remaining_quantity > 0.0 && fill.remaining_quantity < sell_order.3 {
                self.create_remainder_order(
                    &sell_order.1,
                    fill.remaining_quantity,
                    sell_order.2,
                    "SELL",
                    &sell_order.4,
                    sell_order.0,
                    &sell_order.6,
                    &sell_order.7,
                );
            }

            // Remove filled orders from queues
            if fill.filled_quantity >= buy_order.3 {
                buy_orders.pop_front();
            }
            if fill.filled_quantity >= sell_order.3 {
                sell_orders.pop_front();
            }
        }

        fills
    }

    /// Execute a single partial fill
    fn execute_partial_fill(
        &self,
        buy_order: &(u64, String, f64, f64, String, f64, String, String),
        sell_order: &(u64, String, f64, f64, String, f64, String, String),
    ) -> PartialFillResult {
        let (buy_time, buy_id, buy_price, buy_qty, symbol, buy_fee, _, _) = buy_order;
        let (sell_time, sell_id, sell_price, sell_qty, _, sell_fee, _, _) = sell_order;

        // Fill quantity is minimum of both
        let filled_quantity = buy_qty.min(sell_qty);

        // Fill price is average of limit prices (or market price)
        let fill_price = (buy_price + sell_price) / 2.0;

        // Fee calculation (KK99)
        let taker_fee_rate = if buy_time > sell_time { buy_fee } else { sell_fee };
        let fee_kk99 = filled_quantity * fill_price * (taker_fee_rate / 100.0);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_micros() as u64;

        let remaining_quantity = (buy_qty - filled_quantity).max(sell_qty - filled_quantity);

        PartialFillResult {
            trade_id: Uuid::new_v4().to_string(),
            symbol: symbol.clone(),
            filled_quantity,
            remaining_quantity,
            fill_price,
            fee_kk99,
            timestamp_us: now,
            buy_order_id: buy_id.clone(),
            sell_order_id: sell_id.clone(),
            is_partial: remaining_quantity > 0.0,
        }
    }

    /// Create a remainder order for re-queueing
    fn create_remainder_order(
        &mut self,
        original_order_id: &str,
        remaining_qty: f64,
        price: f64,
        side: &str,
        symbol: &str,
        original_time_priority: u64,
        order_type: &str,
        tif: &str,
    ) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let remainder = RemainderOrder {
            original_order_id: original_order_id.to_string(),
            remaining_quantity: remaining_qty,
            price: if order_type == "LIMIT" { Some(price) } else { None },
            side: side.to_string(),
            symbol: symbol.to_string(),
            order_type: order_type.to_string(),
            time_in_force: tif.to_string(),
            created_at: original_time_priority,
            re_queued_at: now,
            re_queue_count: 0,
            original_time_priority,
        };

        let order_id = format!("{}_remainder_{}", original_order_id, self.remainder_orders.len());
        self.remainder_orders.insert(order_id.clone(), remainder);

        info!(
            "Remainder order created: {} for {} units of {}",
            order_id, remaining_qty, symbol
        );
    }

    /// Get next order respecting time priority
    fn get_next_order(
        &self,
        queue: &VecDeque<(u64, String, f64, f64, String, f64, String, String)>,
        remainders: &HashMap<String, RemainderOrder>,
        side: &str,
    ) -> Option<(u64, String, f64, f64, String, f64, String, String)> {
        // Check if any remainder exists for this side with highest priority
        let mut earliest_remainder: Option<(u64, String, RemainderOrder)> = None;

        for (remainder_id, remainder) in remainders {
            if remainder.side == side {
                if earliest_remainder.is_none()
                    || remainder.original_time_priority
                        < earliest_remainder.as_ref().unwrap().0
                {
                    earliest_remainder = Some((
                        remainder.original_time_priority,
                        remainder_id.clone(),
                        remainder.clone(),
                    ));
                }
            }
        }

        // Compare with queue head
        if let Some(queue_head) = queue.front() {
            if let Some((rem_time, _, rem_order)) = earliest_remainder {
                // Remainder has older time priority (should execute first)
                if rem_time <= queue_head.0 {
                    return Some((
                        rem_order.original_time_priority,
                        rem_order.original_order_id.clone(),
                        rem_order.price.unwrap_or(0.0),
                        rem_order.remaining_quantity,
                        rem_order.symbol.clone(),
                        0.05, // default fee
                        rem_order.order_type.clone(),
                        rem_order.time_in_force.clone(),
                    ));
                }
            }
            Some(*queue_head)
        } else if let Some((rem_time, _, rem_order)) = earliest_remainder {
            Some((
                rem_order.original_time_priority,
                rem_order.original_order_id.clone(),
                rem_order.price.unwrap_or(0.0),
                rem_order.remaining_quantity,
                rem_order.symbol.clone(),
                0.05,
                rem_order.order_type.clone(),
                rem_order.time_in_force.clone(),
            ))
        } else {
            None
        }
    }

    /// Check if prices can match
    fn prices_match(
        &self,
        buy_order: &(u64, String, f64, f64, String, f64, String, String),
        sell_order: &(u64, String, f64, f64, String, f64, String, String),
    ) -> bool {
        let (_, _, buy_price, _, _, _, buy_type, _) = buy_order;
        let (_, _, sell_price, _, _, _, sell_type, _) = sell_order;

        match (buy_type.as_str(), sell_type.as_str()) {
            ("MARKET", _) | (_, "MARKET") => true,
            ("LIMIT", _) => buy_price >= sell_price,
            _ => false,
        }
    }

    /// Update fill tracker with new partial fill
    fn update_fill_tracker(&mut self, order_id: &str, fill: &PartialFillResult) {
        let tracker = self
            .fill_trackers
            .entry(order_id.to_string())
            .or_insert(PartialFillTracker {
                order_id: order_id.to_string(),
                total_quantity: 0.0,
                filled_quantity: 0.0,
                fills: Vec::new(),
                average_fill_price: 0.0,
                total_fees: 0.0,
            });

        tracker.filled_quantity += fill.filled_quantity;
        tracker.total_fees += fill.fee_kk99;
        tracker.average_fill_price =
            (tracker.average_fill_price * (tracker.fills.len() as f64) + fill.fill_price)
                / ((tracker.fills.len() + 1) as f64);
        tracker.fills.push(fill.clone());

        debug!(
            "Fill tracker updated for order {}: {}/{} units",
            order_id, tracker.filled_quantity, tracker.total_quantity
        );
    }

    /// Get fill status for an order
    pub fn get_fill_status(&self, order_id: &str) -> Option<PartialFillTracker> {
        self.fill_trackers.get(order_id).cloned()
    }

    /// Get all pending remainder orders
    pub fn get_remainder_orders(&self) -> Vec<RemainderOrder> {
        self.remainder_orders
            .values()
            .cloned()
            .collect::<Vec<_>>()
    }

    /// Clean up old remainder orders (e.g., cancelled orders)
    pub fn cleanup_remainder_orders(&mut self, cutoff_timestamp: u64) {
        self.remainder_orders
            .retain(|_, remainder| remainder.re_queued_at > cutoff_timestamp);

        info!("Cleaned up old remainder orders");
    }

    /// Calculate VWAP (Volume Weighted Average Price) for a fill sequence
    pub fn calculate_vwap_for_order(&self, order_id: &str) -> Option<f64> {
        let tracker = self.fill_trackers.get(order_id)?;

        if tracker.fills.is_empty() {
            return None;
        }

        let total_volume: f64 = tracker.fills.iter().map(|f| f.filled_quantity).sum();
        let weighted_price: f64 = tracker
            .fills
            .iter()
            .map(|f| f.fill_price * f.filled_quantity)
            .sum();

        Some(weighted_price / total_volume)
    }

    /// Calculate TWAP (Time Weighted Average Price) for a fill sequence
    pub fn calculate_twap_for_order(&self, order_id: &str) -> Option<f64> {
        let tracker = self.fill_trackers.get(order_id)?;

        if tracker.fills.is_empty() {
            return None;
        }

        let total_time: u64 = if tracker.fills.len() > 1 {
            tracker.fills.last().unwrap().timestamp_us - tracker.fills.first().unwrap().timestamp_us
        } else {
            1
        };

        let weighted_price: u64 = tracker
            .fills
            .iter()
            .enumerate()
            .map(|(i, f)| {
                let time_weight = if i < tracker.fills.len() - 1 {
                    tracker.fills[i + 1].timestamp_us - f.timestamp_us
                } else {
                    0
                };
                (f.fill_price as u64) * time_weight
            })
            .sum();

        Some((weighted_price as f64) / (total_time as f64))
    }

    /// Get execution quality metrics
    pub fn get_execution_quality(&self, order_id: &str) -> Option<ExecutionQuality> {
        let tracker = self.fill_trackers.get(order_id)?;
        let vwap = self.calculate_vwap_for_order(order_id)?;

        Some(ExecutionQuality {
            order_id: order_id.to_string(),
            total_fills: tracker.fills.len(),
            total_quantity: tracker.filled_quantity,
            average_fill_price: tracker.average_fill_price,
            vwap,
            total_fees: tracker.total_fees,
            fill_ratio: if tracker.total_quantity > 0.0 {
                tracker.filled_quantity / tracker.total_quantity
            } else {
                1.0
            },
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionQuality {
    pub order_id: String,
    pub total_fills: usize,
    pub total_quantity: f64,
    pub average_fill_price: f64,
    pub vwap: f64,
    pub total_fees: f64,
    pub fill_ratio: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_partial_fill_execution() {
        let mut engine = AdvancedPartialFillEngine::new();

        let mut buy_orders = VecDeque::from(vec![(
            100,
            "BUY_001".to_string(),
            50000.0,
            2.0,
            "BTC".to_string(),
            0.05,
            "LIMIT".to_string(),
            "GTC".to_string(),
        )]);

        let mut sell_orders = VecDeque::from(vec![(
            101,
            "SELL_001".to_string(),
            49950.0,
            1.0,
            "BTC".to_string(),
            0.10,
            "LIMIT".to_string(),
            "GTC".to_string(),
        )]);

        let fills = engine.execute_match_with_partial_fills(&mut buy_orders, &mut sell_orders);

        assert!(!fills.is_empty());
        assert!(fills[0].is_partial);
        assert_eq!(fills[0].filled_quantity, 1.0);
    }

    #[test]
    fn test_remainder_order_creation() {
        let mut engine = AdvancedPartialFillEngine::new();

        engine.create_remainder_order(
            "ORDER_001",
            1.5,
            50000.0,
            "BUY",
            "BTC",
            100,
            "LIMIT",
            "GTC",
        );

        let remainders = engine.get_remainder_orders();
        assert_eq!(remainders.len(), 1);
        assert_eq!(remainders[0].remaining_quantity, 1.5);
    }

    #[test]
    fn test_vwap_calculation() {
        let mut engine = AdvancedPartialFillEngine::new();

        let tracker = PartialFillTracker {
            order_id: "ORDER_001".to_string(),
            total_quantity: 10.0,
            filled_quantity: 10.0,
            fills: vec![
                PartialFillResult {
                    trade_id: "TRADE_001".to_string(),
                    symbol: "BTC".to_string(),
                    filled_quantity: 5.0,
                    remaining_quantity: 5.0,
                    fill_price: 50000.0,
                    fee_kk99: 12.5,
                    timestamp_us: 100,
                    buy_order_id: "BUY_001".to_string(),
                    sell_order_id: "SELL_001".to_string(),
                    is_partial: true,
                },
                PartialFillResult {
                    trade_id: "TRADE_002".to_string(),
                    symbol: "BTC".to_string(),
                    filled_quantity: 5.0,
                    remaining_quantity: 0.0,
                    fill_price: 50100.0,
                    fee_kk99: 12.5,
                    timestamp_us: 200,
                    buy_order_id: "BUY_001".to_string(),
                    sell_order_id: "SELL_001".to_string(),
                    is_partial: false,
                },
            ],
            average_fill_price: 50050.0,
            total_fees: 25.0,
        };

        engine
            .fill_trackers
            .insert("ORDER_001".to_string(), tracker);

        let vwap = engine.calculate_vwap_for_order("ORDER_001");
        assert!(vwap.is_some());
        assert!((vwap.unwrap() - 50050.0).abs() < 0.01);
    }
}
