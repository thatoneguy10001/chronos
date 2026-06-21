//! Game systems — one module per command verb.
//!
//! Each system exposes one or more `process_*` functions that take `&mut World`
//! and `&StaticRepository` and return a result struct. They never touch the
//! `EventLog` or the tick counter; that bookkeeping belongs to `lib.rs`.
//!
//! Systems are pure functions of ECS state: given the same World and repo they
//! always produce the same output. This is what makes replay deterministic.

pub mod ability;
pub mod character;
pub mod character_sheet;
pub mod combat;
pub mod dialogue;
pub mod input_parsing;
pub mod interaction;
pub mod movement;
pub mod poison;
pub mod quest;
pub mod shop;
