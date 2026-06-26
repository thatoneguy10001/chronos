import { QUEST_OBJECTIVES, useBuildStore } from '@/store/buildStore';
import type { DraftQuest, QuestObjectiveType } from '@/store/buildStore';

/**
 * Quest editor — the objectives that chain a world into a story.
 *
 * Each quest is handed out by an NPC, asks the player to do one thing (kill N of
 * an enemy, reach a room, or talk to someone), and pays out gold / XP / hope. A
 * quest can be gated behind other quests, so a sequence of them becomes a
 * narrative thread. Every reference — giver, target, prerequisite — is chosen
 * from what already exists in the other editors, so a quest can't point at
 * nothing.
 */
export function QuestEditor({ onBack }: { onBack: () => void }) {
  const quests = useBuildStore(s => s.draft.quests);
  const npcs = useBuildStore(s => s.draft.npcs);
  const addQuest = useBuildStore(s => s.addQuest);
  const validateQuests = useBuildStore(s => s.validateQuests);
  const errors = validateQuests();

  const labelStyle = {
    color: 'var(--ink-faint)',
    fontSize: '0.7em',
    letterSpacing: '0.15em',
    fontFamily: 'var(--font-dossier)' as const,
  };

  return (
    <div style={{ width: 'min(640px, 100%)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={labelStyle}>{quests.length} QUEST{quests.length === 1 ? '' : 'S'}</span>
        <button
          onClick={() => addQuest()}
          disabled={npcs.length === 0}
          title={npcs.length === 0 ? 'Add an NPC first — quests need a giver' : undefined}
          style={{
            background: 'transparent',
            border: '1px solid var(--ink-narrative)',
            color: 'var(--ink-narrative)',
            fontFamily: 'var(--font-dossier)',
            fontSize: '0.8em',
            padding: '0.4rem 1rem',
            cursor: npcs.length === 0 ? 'default' : 'pointer',
            opacity: npcs.length === 0 ? 0.5 : 1,
          }}
        >
          + ADD QUEST
        </button>
      </div>

      {npcs.length === 0 && (
        <div style={{ color: 'var(--ink-movement)', fontSize: '0.85em', fontStyle: 'italic' }}>
          Add an NPC first — every quest needs someone to hand it out.
        </div>
      )}
      {npcs.length > 0 && quests.length === 0 && (
        <div style={{ color: 'var(--ink-movement)', fontSize: '0.85em', fontStyle: 'italic' }}>
          No quests yet — give the player something to do.
        </div>
      )}

      {quests.map(quest => (
        <QuestCard key={quest.id} quest={quest} />
      ))}

      <div style={{ marginTop: '0.5rem', color: errors.length ? 'var(--error)' : 'var(--ink-movement)', fontSize: '0.78em', fontFamily: 'var(--font-dossier)' }}>
        {errors.length === 0 ? '✓ Quests are valid — the engine will accept this.' : errors.join('  ')}
      </div>

      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          border: '1px solid var(--ink-faint)',
          color: 'var(--ink-narrative)',
          fontFamily: 'var(--font-dossier)',
          fontSize: '0.8em',
          padding: '0.5rem 1.5rem',
          cursor: 'pointer',
          letterSpacing: '0.12em',
        }}
      >
        ← BUILD SECTIONS
      </button>
    </div>
  );
}

function QuestCard({ quest }: { quest: DraftQuest }) {
  const npcs = useBuildStore(s => s.draft.npcs);
  const rooms = useBuildStore(s => s.draft.rooms);
  const classes = useBuildStore(s => s.draft.classes);
  const quests = useBuildStore(s => s.draft.quests);
  const updateQuest = useBuildStore(s => s.updateQuest);
  const removeQuest = useBuildStore(s => s.removeQuest);
  const toggleQuestPrereq = useBuildStore(s => s.toggleQuestPrereq);

  const inputStyle = {
    background: 'rgba(255,255,255,0.4)',
    border: '1px solid var(--ink-faint)',
    borderRadius: 2,
    color: 'var(--ink-narrative)',
    fontFamily: 'var(--font-journal)',
    padding: '0.35rem 0.5rem',
    fontSize: '0.9em',
  } as const;

  const labelStyle = {
    color: 'var(--ink-faint)',
    fontSize: '0.7em',
    letterSpacing: '0.15em',
    fontFamily: 'var(--font-dossier)' as const,
  };

  const enemies = classes.filter(c => c.role === 'enemy');
  const objective = QUEST_OBJECTIVES.find(o => o.value === quest.objectiveType)!;
  // The target dropdown's options depend on what the objective targets.
  const targetOptions =
    objective.targets === 'enemy' ? enemies
    : objective.targets === 'room' ? rooms
    : npcs;
  const otherQuests = quests.filter(q => q.id !== quest.id);

  return (
    <div style={{ border: '1px solid var(--ink-faint)', borderRadius: 2, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input
          value={quest.name}
          onChange={e => updateQuest(quest.id, { name: e.target.value })}
          placeholder="Quest name"
          style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
        />
        <button onClick={() => removeQuest(quest.id)} title="Delete quest" style={{ background: 'transparent', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: '1.1em', padding: '0 0.3rem' }}>✕</button>
      </div>

      <textarea
        value={quest.description}
        onChange={e => updateQuest(quest.id, { description: e.target.value })}
        placeholder="Describe the quest — what the player is being asked to do."
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontSize: '0.82em' }}
      />

      {/* Giver */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--ink-movement)', fontSize: '0.74em', fontFamily: 'var(--font-dossier)' }}>
        given by
        <select value={quest.giverNpcId ?? ''} onChange={e => updateQuest(quest.id, { giverNpcId: e.target.value || null })} style={{ ...inputStyle, fontSize: '0.8em', flex: 1 }}>
          <option value="">— choose NPC —</option>
          {npcs.map(n => (
            <option key={n.id} value={n.id}>{n.name || n.id}</option>
          ))}
        </select>
      </label>

      {/* Objective */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...labelStyle, fontSize: '0.74em', letterSpacing: '0.1em' }}>OBJECTIVE</span>
        <select value={quest.objectiveType} onChange={e => updateQuest(quest.id, { objectiveType: e.target.value as QuestObjectiveType })} style={{ ...inputStyle, fontSize: '0.8em' }}>
          {QUEST_OBJECTIVES.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {quest.objectiveType === 'kill_count' && (
          <input
            type="number"
            min={1}
            value={quest.killCount}
            onChange={e => updateQuest(quest.id, { killCount: Number(e.target.value) })}
            style={{ ...inputStyle, fontSize: '0.8em', width: 56 }}
            title="how many to defeat"
          />
        )}
        <select value={quest.targetId} onChange={e => updateQuest(quest.id, { targetId: e.target.value })} style={{ ...inputStyle, fontSize: '0.8em', flex: 1 }}>
          <option value="">{`— choose ${objective.targets} —`}</option>
          {targetOptions.map(t => (
            <option key={t.id} value={t.id}>{t.name || t.id}</option>
          ))}
        </select>
      </div>

      {/* Rewards */}
      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
        {(['goldReward', 'xpReward', 'hopeReward'] as const).map(key => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-movement)', fontSize: '0.72em', fontFamily: 'var(--font-dossier)' }}>
            {key === 'goldReward' ? 'Gold' : key === 'xpReward' ? 'XP' : 'Hope'}
            <input
              type="number"
              value={quest[key]}
              onChange={e => updateQuest(quest.id, { [key]: Number(e.target.value) })}
              style={{ ...inputStyle, fontSize: '0.8em', width: 60 }}
            />
          </label>
        ))}
      </div>

      {/* Flavour text */}
      <textarea
        value={quest.acceptText}
        onChange={e => updateQuest(quest.id, { acceptText: e.target.value })}
        placeholder="On accept — what the giver says when the player takes the quest. (optional)"
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontSize: '0.8em' }}
      />
      <textarea
        value={quest.completeText}
        onChange={e => updateQuest(quest.id, { completeText: e.target.value })}
        placeholder="On complete — what the giver says when the player turns it in. (optional)"
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontSize: '0.8em' }}
      />

      {/* Prerequisites — gate this quest behind others to build a chain. */}
      {otherQuests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={labelStyle}>REQUIRES FIRST</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {otherQuests.map(q => (
              <label key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-movement)', fontSize: '0.78em', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={quest.prereqQuestIds.includes(q.id)}
                  onChange={() => toggleQuestPrereq(quest.id, q.id)}
                  style={{ accentColor: 'var(--ink-narrative)' }}
                />
                {q.name || q.id}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
