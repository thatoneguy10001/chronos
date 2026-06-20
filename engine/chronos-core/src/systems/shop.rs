use bevy_ecs::prelude::*;
use crate::components::{Controllable, ItemBlueprint, Position, Wallet};
use crate::data::StaticRepository;
use crate::events::{CommandResult, ContextAction};

pub struct ShopResult {
    pub success: bool,
    pub narrative: String,
    pub context_actions: Vec<ContextAction>,
    pub inventory_ids: Vec<String>,
}

fn err(msg: &str, inventory_ids: Vec<String>) -> ShopResult {
    ShopResult { success: false, narrative: msg.to_string(), context_actions: vec![], inventory_ids }
}

/// List what a vendor NPC is selling and the player's current gold balance.
pub fn process_shop(world: &mut World, repo: &StaticRepository, npc_id: &str) -> ShopResult {
    let npc = match repo.npc(npc_id) {
        Ok(n) => n,
        Err(_) => return err(&format!("There is no '{npc_id}' here."), vec![]),
    };

    if !npc.vendor {
        return err(&format!("{} doesn't seem to be selling anything.", npc.name), vec![]);
    }

    let player_room = {
        let mut q = world.query_filtered::<&Position, With<Controllable>>();
        q.iter(world).next().map(|p| p.room_id.clone())
    };

    let npc_room = repo.npc_room(npc_id);
    if player_room.as_deref() != npc_room {
        return err(&format!("{} is not here.", npc.name), player_inventory_ids(world));
    }

    let gold = {
        let mut q = world.query_filtered::<&Wallet, With<Controllable>>();
        q.iter(world).next().map(|w| w.gold).unwrap_or(0)
    };

    if npc.shop.is_empty() {
        return ShopResult {
            success: true,
            narrative: format!("{} has nothing for sale right now.", npc.name),
            context_actions: vec![],
            inventory_ids: player_inventory_ids(world),
        };
    }

    let mut lines = vec![
        format!("{} offers the following wares:", npc.name),
        format!("(You have {} gold)", gold),
        String::new(),
    ];
    let mut actions = vec![];

    for shop_item in &npc.shop {
        let item_name_owned = repo.item(&shop_item.item_id)
            .map(|it| it.name.clone())
            .unwrap_or_else(|_| shop_item.item_id.clone());
        let item_name = item_name_owned.as_str();
        lines.push(format!("  {} — {} gold", item_name, shop_item.price));
        let affordable = gold >= shop_item.price;
        if affordable {
            actions.push(ContextAction {
                label: format!("Buy {} ({} gold)", item_name, shop_item.price),
                command: format!("buy {} {}", npc_id, shop_item.item_id),
            });
        } else {
            actions.push(ContextAction {
                label: format!("{} — {} gold (can't afford)", item_name, shop_item.price),
                command: String::new(),
            });
        }
    }

    ShopResult {
        success: true,
        narrative: lines.join("\n"),
        context_actions: actions,
        inventory_ids: player_inventory_ids(world),
    }
}

/// Purchase one item from a vendor NPC. Deducts gold and spawns the item into inventory.
pub fn process_buy(world: &mut World, repo: &StaticRepository, npc_id: &str, item_id: &str) -> ShopResult {
    let npc = match repo.npc(npc_id) {
        Ok(n) => n.clone(),
        Err(_) => return err(&format!("There is no '{npc_id}' here."), player_inventory_ids(world)),
    };

    if !npc.vendor {
        return err(&format!("{} doesn't sell anything.", npc.name), player_inventory_ids(world));
    }

    let npc_room = repo.npc_room(npc_id).map(|r| r.to_string());
    let player_room = {
        let mut q = world.query_filtered::<&Position, With<Controllable>>();
        q.iter(world).next().map(|p| p.room_id.clone())
    };
    if player_room != npc_room {
        return err(&format!("{} is not here.", npc.name), player_inventory_ids(world));
    }

    let shop_entry = match npc.shop.iter().find(|si| si.item_id == item_id) {
        Some(s) => s.clone(),
        None => return err(&format!("{} doesn't sell that.", npc.name), player_inventory_ids(world)),
    };

    let item_template = match repo.item(item_id) {
        Ok(it) => it.clone(),
        Err(_) => return err(&format!("Unknown item '{item_id}'."), player_inventory_ids(world)),
    };

    // Find player entity and gold
    let player_e = {
        let mut q = world.query_filtered::<Entity, With<Controllable>>();
        q.iter(world).next()
    };
    let Some(player_e) = player_e else {
        return err("You have no character.", player_inventory_ids(world));
    };

    let gold = world.entity(player_e).get::<Wallet>().map(|w| w.gold).unwrap_or(0);
    if gold < shop_entry.price {
        return err(
            &format!("You need {} gold but only have {}.", shop_entry.price, gold),
            player_inventory_ids(world),
        );
    }

    // Deduct gold
    if let Some(mut wallet) = world.entity_mut(player_e).get_mut::<Wallet>() {
        wallet.gold -= shop_entry.price;
    }

    // Spawn item directly into player inventory (skip room step — bought, not found)
    use crate::components::InInventory;
    world.spawn((
        InInventory { owner: player_e },
        ItemBlueprint { id: item_template.id.clone() },
    ));

    let new_gold = world.entity(player_e).get::<Wallet>().map(|w| w.gold).unwrap_or(0);

    ShopResult {
        success: true,
        narrative: format!(
            "You buy {} for {} gold. ({} gold remaining)",
            item_template.name, shop_entry.price, new_gold
        ),
        context_actions: vec![
            ContextAction {
                label: format!("Browse {}'s wares", npc.name),
                command: format!("shop {}", npc_id),
            },
        ],
        inventory_ids: player_inventory_ids(world),
    }
}

fn player_inventory_ids(world: &mut World) -> Vec<String> {
    let player = {
        let mut q = world.query_filtered::<Entity, With<Controllable>>();
        q.iter(world).next()
    };
    let Some(player) = player else { return vec![] };

    use crate::components::InInventory;
    let mut q = world.query::<(&InInventory, &ItemBlueprint)>();
    q.iter(world)
        .filter(|(inv, _)| inv.owner == player)
        .map(|(_, bp)| bp.id.clone())
        .collect()
}

/// Compute the result of a `CommandResult` from a `ShopResult`.
pub fn shop_result_to_command(r: ShopResult, tick: u64, game_time: u32) -> CommandResult {
    CommandResult {
        success: r.success,
        narrative: r.narrative,
        context_actions: r.context_actions,
        inventory_ids: r.inventory_ids,
        tick,
        game_time,
    }
}
