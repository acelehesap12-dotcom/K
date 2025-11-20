use crate::types::*;
use dashmap::DashMap;
use parking_lot::RwLock;
use rust_decimal::Decimal;
use std::sync::Arc;
use tracing::{info, warn};
use uuid::Uuid;
use chrono::Utc;

pub struct MatchingEngine {
    order_books: Arc<DashMap<String, Arc<RwLock<OrderBook>>>>,
    orders: Arc<DashMap<String, Order>>,
}

impl MatchingEngine {
    pub fn new() -> Self {
        Self {
            order_books: Arc::new(DashMap::new()),
            orders: Arc::new(DashMap::new()),
        }
    }

    pub fn place_order(&self, mut order: Order) -> MatchingResult {
        info!(
            "Placing order: {} {} {} @ {} ({})",
            order.id, order.side as u8, order.amount, order.price, order.symbol
        );

        let book = self.get_or_create_book(&order.symbol);
        let mut result = MatchingResult::new();

        // Match order
        match order.order_type {
            OrderType::Market => {
                result = self.match_market_order(&mut order, &book);
            }
            OrderType::Limit => {
                result = self.match_limit_order(&mut order, &book);
            }
        }

        // Add remaining amount to order book if not fully filled
        if !order.is_filled() {
            let mut book_guard = book.write();
            book_guard.add_order(order.clone());
            self.orders.insert(order.id.clone(), order.clone());
            info!("Order {} added to book with remaining {}", order.id, order.remaining());
        } else {
            info!("Order {} fully filled", order.id);
        }

        result
    }

    fn match_market_order(&self, order: &mut Order, book: &Arc<RwLock<OrderBook>>) -> MatchingResult {
        let mut result = MatchingResult::new();
        let mut book_guard = book.write();

        let opposite_levels = match order.side {
            OrderSide::Buy => &mut book_guard.asks,
            OrderSide::Sell => &mut book_guard.bids,
        };

        let mut prices_to_remove = Vec::new();

        for (price, level) in opposite_levels.iter_mut() {
            let mut orders_to_remove = Vec::new();

            for (idx, maker_order) in level.orders.iter_mut().enumerate() {
                if order.is_filled() {
                    break;
                }

                let fill_amount = order.remaining().min(maker_order.remaining());
                let fill_price = maker_order.price;

                // Create trade
                let trade = Trade {
                    id: Uuid::new_v4().to_string(),
                    symbol: order.symbol.clone(),
                    maker_order_id: maker_order.id.clone(),
                    taker_order_id: order.id.clone(),
                    price: fill_price,
                    amount: fill_amount,
                    taker_side: order.side,
                    timestamp: Utc::now().timestamp_millis(),
                };

                result.trades.push(trade);

                // Update filled amounts
                order.filled += fill_amount;
                maker_order.filled += fill_amount;

                if maker_order.is_filled() {
                    orders_to_remove.push(idx);
                }

                result.updated_orders.push(maker_order.clone());
            }

            // Remove filled orders (reverse order to maintain indices)
            for idx in orders_to_remove.iter().rev() {
                level.orders.remove(*idx);
            }

            if level.orders.is_empty() {
                prices_to_remove.push(*price);
            }

            if order.is_filled() {
                break;
            }
        }

        // Remove empty price levels
        for price in prices_to_remove {
            opposite_levels.remove(&price);
        }

        result
    }

    fn match_limit_order(&self, order: &mut Order, book: &Arc<RwLock<OrderBook>>) -> MatchingResult {
        let mut result = MatchingResult::new();
        let mut book_guard = book.write();

        let opposite_levels = match order.side {
            OrderSide::Buy => &mut book_guard.asks,
            OrderSide::Sell => &mut book_guard.bids,
        };

        let mut prices_to_remove = Vec::new();

        for (price, level) in opposite_levels.iter_mut() {
            // Check if price crosses
            let crosses = match order.side {
                OrderSide::Buy => *price <= order.price,
                OrderSide::Sell => *price >= order.price,
            };

            if !crosses {
                break;
            }

            let mut orders_to_remove = Vec::new();

            for (idx, maker_order) in level.orders.iter_mut().enumerate() {
                if order.is_filled() {
                    break;
                }

                let fill_amount = order.remaining().min(maker_order.remaining());
                let fill_price = maker_order.price; // Price-time priority

                // Create trade
                let trade = Trade {
                    id: Uuid::new_v4().to_string(),
                    symbol: order.symbol.clone(),
                    maker_order_id: maker_order.id.clone(),
                    taker_order_id: order.id.clone(),
                    price: fill_price,
                    amount: fill_amount,
                    taker_side: order.side,
                    timestamp: Utc::now().timestamp_millis(),
                };

                result.trades.push(trade);

                order.filled += fill_amount;
                maker_order.filled += fill_amount;

                if maker_order.is_filled() {
                    orders_to_remove.push(idx);
                }

                result.updated_orders.push(maker_order.clone());
            }

            for idx in orders_to_remove.iter().rev() {
                level.orders.remove(*idx);
            }

            if level.orders.is_empty() {
                prices_to_remove.push(*price);
            }

            if order.is_filled() {
                break;
            }
        }

        for price in prices_to_remove {
            opposite_levels.remove(&price);
        }

        result
    }

    pub fn cancel_order(&self, order_id: &str) -> Option<Order> {
        if let Some((_, order)) = self.orders.remove(order_id) {
            let book = self.get_or_create_book(&order.symbol);
            let mut book_guard = book.write();
            
            book_guard.remove_order(order_id, order.side, order.price);
            info!("Cancelled order: {}", order_id);
            
            Some(order)
        } else {
            warn!("Order not found for cancellation: {}", order_id);
            None
        }
    }

    pub fn get_order_book(&self, symbol: &str, depth: usize) -> Option<OrderBook> {
        self.order_books.get(symbol).map(|book_ref| {
            let book = book_ref.read();
            
            // Return a snapshot with limited depth
            let mut snapshot = OrderBook::new(symbol.to_string());
            
            for (price, level) in book.bids.iter().rev().take(depth) {
                snapshot.bids.insert(*price, level.clone());
            }
            
            for (price, level) in book.asks.iter().take(depth) {
                snapshot.asks.insert(*price, level.clone());
            }
            
            snapshot
        })
    }

    fn get_or_create_book(&self, symbol: &str) -> Arc<RwLock<OrderBook>> {
        self.order_books
            .entry(symbol.to_string())
            .or_insert_with(|| Arc::new(RwLock::new(OrderBook::new(symbol.to_string()))))
            .clone()
    }

    pub fn get_stats(&self) -> EngineStats {
        EngineStats {
            total_orders: self.orders.len(),
            active_symbols: self.order_books.len(),
        }
    }
}

pub struct EngineStats {
    pub total_orders: usize,
    pub active_symbols: usize,
}
