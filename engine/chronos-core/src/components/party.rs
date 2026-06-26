use bevy_ecs::component::Component;

/// Marks an entity as a member of the player's party — a companion who travels
/// with the lead. Party members are full bodies (Identity + Stats + Health) but,
/// unlike the lead, they do **not** carry [`Controllable`](super::Controllable):
/// the world still resolves every command from the one controllable lead, so
/// movement, dialogue, shops and quests are unaffected by the party's size.
///
/// `order` is the member's slot in the roster (0 = first companion), giving the
/// party a stable, deterministic ordering for display and, later, turn order.
#[derive(Component, Debug, Clone)]
pub struct PartyMember {
    pub order: u32,
}
