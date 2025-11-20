use crate::Order;
use std::collections::HashMap;

pub struct RiskEngine {
    user_limits: HashMap<String, UserRiskLimit>,
}

#[derive(Clone)]
struct UserRiskLimit {
    max_position_size: f64,
    max_daily_loss: f64,
    var_95: f64,
    var_99: f64,
}

impl RiskEngine {
    pub fn new() -> Self {
        Self {
            user_limits: HashMap::new(),
        }
    }

    pub fn validate_order(&self, order: &Order) -> bool {
        // Basic validation
        if order.quantity <= 0.0 {
            return false;
        }

        // Price validation
        if let Some(price) = order.price {
            if price <= 0.0 {
                return false;
            }
        }

        // Portfolio VaR check (simplified)
        let var_95_threshold = 100_000.0; // KK99
        if order.quantity * order.price.unwrap_or(1.0) > var_95_threshold {
            return false;
        }

        // SPAN margin calculation (simplified)
        let span_margin_required = order.quantity * order.price.unwrap_or(1.0) * 0.05; // 5%
        // Check user's available margin...

        true
    }

    pub fn calculate_portfolio_var(&self, user_id: &str, positions: &[Order]) -> (f64, f64) {
        let mut total_value = 0.0;
        
        for position in positions {
            total_value += position.quantity * position.price.unwrap_or(0.0);
        }

        // Simplified VaR calculation
        let var_95 = total_value * 0.05; // 5% daily loss at 95% confidence
        let var_99 = total_value * 0.10; // 10% daily loss at 99% confidence

        (var_95, var_99)
    }

    pub fn calculate_span_margin(&self, positions: &[Order]) -> f64 {
        // Simplified SPAN margin: 5% of notional value
        let notional: f64 = positions.iter()
            .map(|p| p.quantity * p.price.unwrap_or(0.0))
            .sum();
        
        notional * 0.05
    }
}
