use bevy_ecs::prelude::*;

/// Tracks the player's currency balances.
/// `gold` = primary (scraps in Iron & Blood, gold in Millbrook).
/// `shards` = secondary Aetherian currency (Iron & Blood only; 0 elsewhere).
#[derive(Component, Debug, Clone)]
pub struct Wallet {
    pub gold: i32,
    pub shards: i32,
}

impl Wallet {
    pub fn new() -> Self {
        Self { gold: 0, shards: 0 }
    }
}
