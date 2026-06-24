use bevy_ecs::prelude::Component;

/// Which logical body slot an item occupies.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EquipSlot {
    Weapon,
    Head,
    Body,
    Hands,
    Feet,
    Accessory,
}

impl EquipSlot {
    /// Canonical lower-case name used in text commands ("unequip head").
    pub fn name(self) -> &'static str {
        match self {
            EquipSlot::Weapon    => "weapon",
            EquipSlot::Head      => "head",
            EquipSlot::Body      => "body",
            EquipSlot::Hands     => "hands",
            EquipSlot::Feet      => "feet",
            EquipSlot::Accessory => "accessory",
        }
    }

    /// Determine which slot an item belongs in by scanning its tags.
    /// Returns None if the item has no equippable tags.
    pub fn from_tags(tags: &[String]) -> Option<EquipSlot> {
        for tag in tags {
            match tag.as_str() {
                "weapon" | "sword" | "axe" | "spear" | "bow" | "staff" | "dagger" | "mace"
                | "shield" | "gun" | "syringe-spear" => return Some(EquipSlot::Weapon),
                "helm" | "helmet" | "hat" | "hood" | "crown" | "cap" | "headgear"
                | "circlet" => return Some(EquipSlot::Head),
                "body" | "chest" | "vest" | "coat" | "robe" | "plate" | "cuirass"
                | "jerkin" | "tunic" => return Some(EquipSlot::Body),
                "gloves" | "gauntlets" | "bracers" | "hands" | "mitts" => {
                    return Some(EquipSlot::Hands)
                }
                "boots" | "shoes" | "greaves" | "feet" | "sandals" | "sabatons" => {
                    return Some(EquipSlot::Feet)
                }
                "accessory" | "ring" | "amulet" | "talisman" | "badge" | "pendant"
                | "brooch" | "charm" => return Some(EquipSlot::Accessory),
                _ => {}
            }
        }
        None
    }

    /// Parse a slot name from a player command token ("head", "weapon", etc.).
    pub fn from_str(s: &str) -> Option<EquipSlot> {
        match s.to_lowercase().as_str() {
            "weapon" | "wield" => Some(EquipSlot::Weapon),
            "head" | "helm" | "helmet" => Some(EquipSlot::Head),
            "body" | "chest" | "armor" | "armour" => Some(EquipSlot::Body),
            "hands" | "gloves" | "gauntlets" => Some(EquipSlot::Hands),
            "feet" | "boots" | "shoes" => Some(EquipSlot::Feet),
            "accessory" | "acc" | "ring" | "amulet" | "accessory_1" | "accessory1" => {
                Some(EquipSlot::Accessory)
            }
            _ => None,
        }
    }
}

/// Tracks what items the player has equipped, one item per body slot.
/// Accessories get two slots; everything else is one.
#[derive(Component, Debug, Clone, Default)]
pub struct EquipmentSlots {
    pub weapon:      Option<String>,
    pub head:        Option<String>,
    pub body:        Option<String>,
    pub hands:       Option<String>,
    pub feet:        Option<String>,
    pub accessory_1: Option<String>,
    pub accessory_2: Option<String>,
}

impl EquipmentSlots {
    pub fn new() -> Self {
        Self::default()
    }

    /// Set a slot, returning whatever was previously there.
    /// For accessories, fills accessory_1 first, then accessory_2;
    /// once both are full, replaces accessory_1.
    pub fn set(&mut self, slot: EquipSlot, item_id: String) -> Option<String> {
        match slot {
            EquipSlot::Weapon => self.weapon.replace(item_id),
            EquipSlot::Head   => self.head.replace(item_id),
            EquipSlot::Body   => self.body.replace(item_id),
            EquipSlot::Hands  => self.hands.replace(item_id),
            EquipSlot::Feet   => self.feet.replace(item_id),
            EquipSlot::Accessory => {
                if self.accessory_1.is_none() {
                    self.accessory_1.replace(item_id)
                } else if self.accessory_2.is_none() {
                    self.accessory_2.replace(item_id)
                } else {
                    self.accessory_1.replace(item_id)
                }
            }
        }
    }

    /// Clear a slot by name, returning whatever was there.
    /// Accepts "accessory" to clear accessory_1, "accessory_2" for the second.
    pub fn clear(&mut self, slot: EquipSlot) -> Option<String> {
        match slot {
            EquipSlot::Weapon    => self.weapon.take(),
            EquipSlot::Head      => self.head.take(),
            EquipSlot::Body      => self.body.take(),
            EquipSlot::Hands     => self.hands.take(),
            EquipSlot::Feet      => self.feet.take(),
            EquipSlot::Accessory => {
                // Try accessory_2 first so the player can "unequip accessory_2" naturally;
                // "unequip accessory" clears the most recently filled slot.
                if self.accessory_2.is_some() {
                    self.accessory_2.take()
                } else {
                    self.accessory_1.take()
                }
            }
        }
    }

    /// Returns true if nothing is equipped anywhere.
    pub fn is_empty(&self) -> bool {
        self.weapon.is_none()
            && self.head.is_none()
            && self.body.is_none()
            && self.hands.is_none()
            && self.feet.is_none()
            && self.accessory_1.is_none()
            && self.accessory_2.is_none()
    }
}
