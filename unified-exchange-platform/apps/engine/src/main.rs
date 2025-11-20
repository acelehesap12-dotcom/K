use std::sync::Arc;
use std::time::Instant;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use log::{info, debug, error};

mod order_book;
mod matching;
mod risk;
mod sor;
mod replay;

use order_book::OrderBook;
use matching::MatchingEngine;
use risk::RiskEngine;
use sor::SmartOrderRouter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: String,
    pub user_id: String,
    pub symbol: String,
    pub side: Side,
    pub order_type: OrderType,
    pub quantity: f64,
    pub price: Option<f64>,
    pub timestamp: u64,
    pub sequence: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OrderType {
    Limit,
    Market,
    StopLoss { trigger_price: f64 },
    TakeProfit { trigger_price: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub id: String,
    pub buy_order_id: String,
    pub sell_order_id: String,
    pub symbol: String,
    pub quantity: f64,
    pub price: f64,
    pub timestamp: u64,
}

pub struct MatchingEngine {
    order_books: Arc<Mutex<std::collections::HashMap<String, OrderBook>>>,
    risk_engine: Arc<RiskEngine>,
    sor: Arc<SmartOrderRouter>,
    sequence_number: Arc<Mutex<u64>>,
    start_time: Instant,
}

impl MatchingEngine {
    pub fn new() -> Self {
        env_logger::init();
        
        Self {
            order_books: Arc::new(Mutex::new(std::collections::HashMap::new())),
            risk_engine: Arc::new(RiskEngine::new()),
            sor: Arc::new(SmartOrderRouter::new()),
            sequence_number: Arc::new(Mutex::new(0)),
            start_time: Instant::now(),
        }
    }

    pub fn process_order(&self, mut order: Order) -> Result<Vec<Trade>, String> {
        let mut seq = self.sequence_number.lock();
        *seq += 1;
        order.sequence = *seq;
        drop(seq);

        // Risk checks
        if !self.risk_engine.validate_order(&order) {
            return Err("Risk check failed".to_string());
        }

        // Get or create order book
        let mut books = self.order_books.lock();
        let book = books.entry(order.symbol.clone())
            .or_insert_with(|| OrderBook::new(order.symbol.clone()));

        // Match orders
        let trades = book.process_order(order)?;

        Ok(trades)
    }

    pub fn get_order_book(&self, symbol: &str) -> Option<String> {
        let books = self.order_books.lock();
        books.get(symbol).map(|b| format!("{:?}", b))
    }

    pub fn latency_microseconds(&self) -> u128 {
        self.start_time.elapsed().as_micros()
    }
}

#[tokio::main]
async fn main() {
    env_logger::init();
    info!("Starting KK99 Exchange Matching Engine");

    let engine = Arc::new(MatchingEngine::new());

    info!("Matching Engine initialized and ready for orders");
    info!("Listening for incoming orders...");

    // Example: Process sample orders
    let sample_buy = Order {
        id: "buy-1".to_string(),
        user_id: "user-1".to_string(),
        symbol: "BTC-USD".to_string(),
        side: Side::Buy,
        order_type: OrderType::Limit,
        quantity: 1.0,
        price: Some(45000.0),
        timestamp: 1000,
        sequence: 1,
    };

    let sample_sell = Order {
        id: "sell-1".to_string(),
        user_id: "user-2".to_string(),
        symbol: "BTC-USD".to_string(),
        side: Side::Sell,
        order_type: OrderType::Limit,
        quantity: 1.0,
        price: Some(44900.0),
        timestamp: 1001,
        sequence: 2,
    };

    match engine.process_order(sample_buy) {
        Ok(trades) => info!("Buy order processed: {} trades executed", trades.len()),
        Err(e) => error!("Buy order failed: {}", e),
    }

    match engine.process_order(sample_sell) {
        Ok(trades) => info!("Sell order processed: {} trades executed", trades.len()),
        Err(e) => error!("Sell order failed: {}", e),
    }

    // Main order processing loop
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        info!("Engine latency: {} microseconds", engine.latency_microseconds());
    }
}
