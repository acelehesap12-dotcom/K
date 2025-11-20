mod types;
mod engine;

use engine::MatchingEngine;
use tonic::{transport::Server, Request, Response, Status};
use tracing::{info, Level};
use tracing_subscriber;
use std::sync::Arc;

// Include generated protobuf code
pub mod matching {
    tonic::include_proto!("matching");
}

use matching::{
    matching_engine_server::{MatchingEngine as MatchingEngineTrait, MatchingEngineServer},
    OrderRequest, OrderResponse, CancelRequest, CancelResponse,
    OrderBookRequest, OrderBookResponse, StreamRequest, TradeEvent,
    Fill, PriceLevel,
};

pub struct MatchingEngineService {
    engine: Arc<MatchingEngine>,
}

impl MatchingEngineService {
    pub fn new() -> Self {
        Self {
            engine: Arc::new(MatchingEngine::new()),


#[tonic::async_trait]
impl MatchingEngineTrait for MatchingEngineService {
    async fn place_order(
        &self,
        request: Request<OrderRequest>,
    ) -> Result<Response<OrderResponse>, Status> {
        let req = request.into_inner();
        
        // Convert proto to internal Order
        let order = types::Order {
            id: req.order_id,
            user_id: req.user_id,
            symbol: req.symbol,
            side: match req.side {
                0 => types::OrderSide::Buy,
                1 => types::OrderSide::Sell,
                _ => return Err(Status::invalid_argument("Invalid order side")),
            },
            order_type: match req.r#type {
                0 => types::OrderType::Limit,
                1 => types::OrderType::Market,
                _ => return Err(Status::invalid_argument("Invalid order type")),
            },
            price: req.price.parse().map_err(|_| Status::invalid_argument("Invalid price"))?,
            amount: req.amount.parse().map_err(|_| Status::invalid_argument("Invalid amount"))?,
            filled: rust_decimal::Decimal::ZERO,
            timestamp: req.timestamp,
        };

        let result = self.engine.place_order(order);

        let fills: Vec<Fill> = result
            .trades
            .iter()
            .map(|t| Fill {
                trade_id: t.id.clone(),
                price: t.price.to_string(),
                amount: t.amount.to_string(),
                timestamp: t.timestamp,
            })
            .collect();

        Ok(Response::new(OrderResponse {
            success: true,
            order_id: req.order_id,
            message: format!("Order placed with {} fills", fills.len()),
            fills,
        }))
    }

    async fn cancel_order(
        &self,
        request: Request<CancelRequest>,
    ) -> Result<Response<CancelResponse>, Status> {
        let req = request.into_inner();

        match self.engine.cancel_order(&req.order_id) {
            Some(_) => Ok(Response::new(CancelResponse {
                success: true,
                message: "Order cancelled".to_string(),
            })),
            None => Ok(Response::new(CancelResponse {
                success: false,
                message: "Order not found".to_string(),
            })),
        }
    }

    async fn get_order_book(
        &self,
        request: Request<OrderBookRequest>,
    ) -> Result<Response<OrderBookResponse>, Status> {
        let req = request.into_inner();

        match self.engine.get_order_book(&req.symbol, req.depth as usize) {
            Some(book) => {
                let bids: Vec<PriceLevel> = book
                    .bids
                    .iter()
                    .map(|(price, level)| PriceLevel {
                        price: price.to_string(),
                        amount: level.total_amount().to_string(),
                        order_count: level.orders.len() as i32,
                    })
                    .collect();

                let asks: Vec<PriceLevel> = book
                    .asks
                    .iter()
                    .map(|(price, level)| PriceLevel {
                        price: price.to_string(),
                        amount: level.total_amount().to_string(),
                        order_count: level.orders.len() as i32,
                    })
                    .collect();

                Ok(Response::new(OrderBookResponse { bids, asks }))
            }
            None => Err(Status::not_found("Symbol not found")),
        }
    }

    type StreamTradesStream = tokio_stream::wrappers::ReceiverStream<Result<TradeEvent, Status>>;

    async fn stream_trades(
        &self,
        _request: Request<StreamRequest>,
    ) -> Result<Response<Self::StreamTradesStream>, Status> {
        let (_tx, rx) = tokio::sync::mpsc::channel(100);
        
        // TODO: Implement trade streaming
        // This would connect to Kafka or internal event system
        
        Ok(Response::new(tokio_stream::wrappers::ReceiverStream::new(rx)))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    let addr = "[::1]:50051".parse()?;
    let service = MatchingEngineService::new();

    info!("🦀 KK99 Rust Matching Engine starting on {}", addr);
    info!("Sub-microsecond latency order matching ready");

    Server::builder()
        .add_service(MatchingEngineServer::new(service))
        .serve(addr)
        .await?;

    Ok(())
}
    }
}
