use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::BTreeMap;
use chrono::Utc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderType {
    Limit,
    Market,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: String,
    pub user_id: String,
    pub symbol: String,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub price: Decimal,
    pub amount: Decimal,
    pub filled: Decimal,
    pub timestamp: i64,
}

impl Order {
    pub fn remaining(&self) -> Decimal {
        self.amount - self.filled
    }

    pub fn is_filled(&self) -> bool {
        self.filled >= self.amount
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub id: String,
    pub symbol: String,
    pub maker_order_id: String,
    pub taker_order_id: String,
    pub price: Decimal,
    pub amount: Decimal,
    pub taker_side: OrderSide,
    pub timestamp: i64,
}

#[derive(Debug, Clone)]
pub struct PriceLevel {
    pub price: Decimal,
    pub orders: Vec<Order>,
}

impl PriceLevel {
    pub fn new(price: Decimal) -> Self {
        Self {
            price,
            orders: Vec::new(),
        }
    }

    pub fn total_amount(&self) -> Decimal {
        self.orders.iter().map(|o| o.remaining()).sum()
    }

    pub fn add_order(&mut self, order: Order) {
        self.orders.push(order);
    }

    pub fn remove_order(&mut self, order_id: &str) -> Option<Order> {
        if let Some(pos) = self.orders.iter().position(|o| o.id == order_id) {
            Some(self.orders.remove(pos))
        } else {
            None
        }
    }
}

pub struct OrderBook {
    pub symbol: String,
    pub bids: BTreeMap<Decimal, PriceLevel>, // Buy orders (highest first)
    pub asks: BTreeMap<Decimal, PriceLevel>, // Sell orders (lowest first)
}

impl OrderBook {
    pub fn new(symbol: String) -> Self {
        Self {
            symbol,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
        }
    }

    pub fn add_order(&mut self, order: Order) {
        let levels = match order.side {
            OrderSide::Buy => &mut self.bids,
            OrderSide::Sell => &mut self.asks,
        };

        levels
            .entry(order.price)
            .or_insert_with(|| PriceLevel::new(order.price))
            .add_order(order);
    }

    pub fn remove_order(&mut self, order_id: &str, side: OrderSide, price: Decimal) -> Option<Order> {
        let levels = match side {
            OrderSide::Buy => &mut self.bids,
            OrderSide::Sell => &mut self.asks,
        };

        if let Some(level) = levels.get_mut(&price) {
            let order = level.remove_order(order_id);
            
            // Remove empty price level
            if level.orders.is_empty() {
                levels.remove(&price);
            }
            
            order
        } else {
            None
        }
    }

    pub fn best_bid(&self) -> Option<Decimal> {
        self.bids.keys().next_back().copied()
    }

    pub fn best_ask(&self) -> Option<Decimal> {
        self.asks.keys().next().copied()
    }

    pub fn spread(&self) -> Option<Decimal> {
        match (self.best_ask(), self.best_bid()) {
            (Some(ask), Some(bid)) => Some(ask - bid),
            _ => None,
        }
    }

    pub fn mid_price(&self) -> Option<Decimal> {
        match (self.best_ask(), self.best_bid()) {
            (Some(ask), Some(bid)) => Some((ask + bid) / Decimal::from(2)),
            _ => None,
        }
    }
}

pub struct MatchingResult {
    pub trades: Vec<Trade>,
    pub updated_orders: Vec<Order>,
}

impl MatchingResult {
    pub fn new() -> Self {
        Self {
            trades: Vec::new(),
            updated_orders: Vec::new(),
        }
    }
}
