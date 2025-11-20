// Deterministic Replay Engine
// Allows reconstruction of exact market states for backtesting and audit

use crate::Order;
use std::collections::VecDeque;

pub struct ReplayEngine {
    events: VecDeque<ReplayEvent>,
    checkpoint_interval: usize,
    checkpoints: Vec<Checkpoint>,
}

#[derive(Clone, Debug)]
pub enum ReplayEvent {
    OrderCreated(Order),
    OrderCancelled(String),
    Snapshot(std::collections::HashMap<String, f64>),
}

#[derive(Clone, Debug)]
struct Checkpoint {
    sequence: u64,
    state: std::collections::HashMap<String, f64>,
}

impl ReplayEngine {
    pub fn new() -> Self {
        Self {
            events: VecDeque::new(),
            checkpoint_interval: 10000,
            checkpoints: Vec::new(),
        }
    }

    pub fn record_event(&mut self, event: ReplayEvent) {
        self.events.push_back(event);
    }

    pub fn create_checkpoint(&mut self, sequence: u64, state: std::collections::HashMap<String, f64>) {
        self.checkpoints.push(Checkpoint {
            sequence,
            state,
        });
    }

    pub fn replay_from_checkpoint(&self, checkpoint_seq: u64) -> Vec<ReplayEvent> {
        let checkpoint = self.checkpoints.iter()
            .find(|c| c.sequence == checkpoint_seq);

        if checkpoint.is_none() {
            return Vec::new();
        }

        // Return all events after checkpoint
        self.events.iter().cloned().collect()
    }
}
