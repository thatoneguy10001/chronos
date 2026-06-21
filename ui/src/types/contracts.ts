/** Mirror of Rust ContextAction */
export interface ContextAction {
  label: string;
  command: string;
}

/** Mirror of Rust NpcSection */
export interface NpcSectionDTO {
  kind: 'action' | 'speech';
  text: string;
}

/** Mirror of Rust CommandResult */
export interface CommandResult {
  success: boolean;
  narrative: string;
  context_actions: ContextAction[];
  inventory_ids: string[];
  tick: number;
  game_time: number;
  npc_sections?: NpcSectionDTO[];
}

export interface QuestProgressDTO {
  quest_id: string;
  name: string;
  description: string;
  objective_hint: string;
  progress: number;
  target: number;
  completed: boolean;
  ready_to_turn_in?: boolean;
}

export interface CharacterStateDTO {
  name: string;
  class_id: string;
  hp: number;
  max_hp: number;
  attack: number;
  defense: number;
  intelligence: number;
  hit: number;
  tech_attack: number;
  evasion: number;
  endurance: number;
  luck: number;
  agility: number;
  xp: number;
  level: number;
  gold: number;
  shards: number;
  equipped_weapon: string | null;
  payload_slots: string[];
  payload_capacity: number;
  active_effects: string[];
  active_quests: QuestProgressDTO[];
}

export interface EnemyStateDTO {
  name: string;
  class_id: string;
  room_id: string;
  hp: number;
  max_hp: number;
  active_effects: string[];
}

/** Mirror of Rust GameStateDTO */
export interface GameStateDTO {
  tick: number;
  game_time: number;
  player_room_id: string;
  current_room_name: string;
  inventory_ids: string[];
  entity_states: EntityStateDTO[];
  event_log: LogEntryDTO[];
  player_character: CharacterStateDTO | null;
  enemies: EnemyStateDTO[];
}

export interface EntityStateDTO {
  blueprint_id: string;
  room_id: string | null;
  owner_index: number | null;
}

export interface LogEntryDTO {
  tick: number;
  event: EngineEvent;
}

export type EngineEvent =
  | { type: 'move'; direction: string }
  | { type: 'pick_up'; item_id: string }
  | { type: 'drop'; item_id: string }
  | { type: 'look' }
  | { type: 'inventory' }
  | { type: 'unknown'; raw: string };

export type InputMode = 'PARSER' | 'BUTTONS';
