use bevy_ecs::component::Component;

/// Combat stats shared by every fighting entity — players and enemies alike.
#[derive(Component, Debug, Clone)]
pub struct Stats {
    pub attack: i32,
    pub defense: i32,
    pub intelligence: i32,
    /// Accuracy — compared against target Evasion to determine hit chance.
    pub hit: i32,
    /// Tech/chemical damage scaling (Iron Apothecary, Field Medic, etc.).
    pub tech_attack: i32,
    /// Dodge — subtracted from attacker Hit to reduce hit chance.
    pub evasion: i32,
    /// Stamina/action pool; governs how long buffs last and secondary resource pools.
    pub endurance: i32,
    /// Crit chance = 5 + luck/2. Also affects item find and debuff success.
    pub luck: i32,
    /// Speed stat. AttacksPerTurn = 1 + agility/25. TurnSpeed = agility*3 + luck.
    pub agility: i32,
}
