use bevy_ecs::prelude::Component;

/// Marks an entity as a weapon assembled from 3 parts.
/// Lives in the player's inventory just like a regular item, but is not backed
/// by a static ItemTemplate — all its data is stored here.
#[derive(Component, Debug, Clone)]
pub struct AssembledWeapon {
    /// Human-readable name shown in inventory and equipment slot.
    pub display_name: String,
    /// Attack bonus applied when equipped (via EquipmentSlots).
    pub attack_bonus: i32,
    /// Optional status effect applied on-hit (kind string, e.g. "bleed").
    pub on_hit_effect: Option<String>,
    /// IDs of the 3 parts consumed during assembly.
    pub part_ids: [String; 3],
}
