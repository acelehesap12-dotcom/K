// Smart Order Router (SOR) - routes orders across multiple venues
// for best execution

pub struct SmartOrderRouter {
    venues: Vec<VenueInfo>,
}

#[derive(Clone)]
struct VenueInfo {
    name: String,
    liquidity: f64,
    spread: f64,
}

impl SmartOrderRouter {
    pub fn new() -> Self {
        Self {
            venues: vec![
                VenueInfo {
                    name: "KK99-Main".to_string(),
                    liquidity: 1_000_000.0,
                    spread: 0.02,
                },
                VenueInfo {
                    name: "External-DEX".to_string(),
                    liquidity: 500_000.0,
                    spread: 0.05,
                },
            ],
        }
    }

    pub fn route_order(&self, symbol: &str, quantity: f64, price: Option<f64>) -> Vec<OrderRoute> {
        let mut routes = Vec::new();

        // Split order across best venues
        let mut remaining = quantity;
        
        for venue in &self.venues {
            if remaining <= 0.0 {
                break;
            }

            let allocate = (remaining * 0.5).min(venue.liquidity);
            
            routes.push(OrderRoute {
                venue: venue.name.clone(),
                quantity: allocate,
                priority: routes.len() as u32,
            });

            remaining -= allocate;
        }

        routes
    }
}

#[derive(Debug, Clone)]
pub struct OrderRoute {
    pub venue: String,
    pub quantity: f64,
    pub priority: u32,
}

mod matching;
