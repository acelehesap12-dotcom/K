use crate::{Order, Side, Trade};
use parking_lot::Mutex;
use std::collections::BTreeMap;

pub struct OrderBook {
    pub symbol: String,
    buy_orders: BTreeMap<u64, Vec<Order>>, // price (inverted for sorting) -> orders
    sell_orders: BTreeMap<u64, Vec<Order>>, // price -> orders
}

impl OrderBook {
    pub fn new(symbol: String) -> Self {
        Self {
            symbol,
            buy_orders: BTreeMap::new(),
            sell_orders: BTreeMap::new(),
        }
    }

    pub fn process_order(&mut self, order: Order) -> Result<Vec<Trade>, String> {
        let mut trades = Vec::new();

        match order.side {
            Side::Buy => {
                // Try to match against sell orders
                trades.extend(self.match_buy_order(&order)?);
            }
            Side::Sell => {
                // Try to match against buy orders
                trades.extend(self.match_sell_order(&order)?);
            }
        }

        Ok(trades)
    }

    fn match_buy_order(&mut self, order: &Order) -> Result<Vec<Trade>, String> {
        let mut trades = Vec::new();
        let mut remaining_qty = order.quantity;

        // Match against sell orders (lowest prices first)
        for (price, sell_orders) in self.sell_orders.iter_mut() {
            if remaining_qty <= 0.0 {
                break;
            }

            let fill_price = (*price as f64) / 1_000_000.0; // Convert from micros

            if let Some(sell_order) = sell_orders.first() {
                if order.price.is_none() || order.price.unwrap() >= fill_price {
                    let match_qty = remaining_qty.min(sell_order.quantity);
                    
                    trades.push(Trade {
                        id: format!("{}-{}", order.id, sell_order.id),
                        buy_order_id: order.id.clone(),
                        sell_order_id: sell_order.id.clone(),
                        symbol: order.symbol.clone(),
                        quantity: match_qty,
                        price: fill_price,
                        timestamp: order.timestamp,
                    });

                    remaining_qty -= match_qty;
                }
            }
        }

        // Add remaining to buy orders if not fully filled
        if remaining_qty > 0.0 {
            let price_micros = order.price.map(|p| (p * 1_000_000.0) as u64).unwrap_or(u64::MAX);
            self.buy_orders.entry(price_micros)
                .or_insert_with(Vec::new)
                .push(Order {
                    quantity: remaining_qty,
                    ..order.clone()
                });
        }

        Ok(trades)
    }

    fn match_sell_order(&mut self, order: &Order) -> Result<Vec<Trade>, String> {
        let mut trades = Vec::new();
        let mut remaining_qty = order.quantity;

        // Match against buy orders (highest prices first)
        for (price, buy_orders) in self.buy_orders.iter_mut().rev() {
            if remaining_qty <= 0.0 {
                break;
            }

            let fill_price = (*price as f64) / 1_000_000.0;

            if let Some(buy_order) = buy_orders.first() {
                if order.price.is_none() || order.price.unwrap() <= fill_price {
                    let match_qty = remaining_qty.min(buy_order.quantity);
                    
                    trades.push(Trade {
                        id: format!("{}-{}", buy_order.id, order.id),
                        buy_order_id: buy_order.id.clone(),
                        sell_order_id: order.id.clone(),
                        symbol: order.symbol.clone(),
                        quantity: match_qty,
                        price: fill_price,
                        timestamp: order.timestamp,
                    });

                    remaining_qty -= match_qty;
                }
            }
        }

        // Add remaining to sell orders if not fully filled
        if remaining_qty > 0.0 {
            let price_micros = order.price.map(|p| (p * 1_000_000.0) as u64).unwrap_or(0);
            self.sell_orders.entry(price_micros)
                .or_insert_with(Vec::new)
                .push(Order {
                    quantity: remaining_qty,
                    ..order.clone()
                });
        }

        Ok(trades)
    }
}
