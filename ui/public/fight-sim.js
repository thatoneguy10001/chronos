/**
 * Vanguard Fight Simulator
 * Runs a single fight (Trench Alpha) using multiple strategies via time travel.
 * Assumes game is loaded with Iron & Blood + Vanguard selected.
 *
 * Usage: paste into browser console after starting game.
 */
;(async function VanguardFightSim() {
  // Prevent concurrent instances from clobbering each other's rewinds
  if (window.__fightSimRunning) { console.warn('[fight-sim] already running — skipped'); return; }
  window.__fightSimRunning = true;
  window.__fightSimResults = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function allLines() {
    return Array.from(
      document.querySelectorAll('#root div[style*="line-height"], #root div[style*="ff6b6b"]')
    );
  }

  /** Send a command and return any new terminal lines as text array. */
  async function cmd(command, waitMs = 120) {
    const before = allLines().length;
    window.__gameCmd(command);
    await sleep(waitMs);
    return allLines().slice(before).map(el => el.textContent.trim()).filter(Boolean);
  }

  /** Parse player HP — store is authoritative, DOM panel is fallback. */
  function getHp() {
    const pc = window.__getState?.()?.playerCharacter;
    if (pc && typeof pc.hp === 'number') return { current: pc.hp, max: pc.max_hp };
    const el = Array.from(document.querySelectorAll('#root *'))
      .find(e => e.childElementCount === 0 && /HP\s+\d+\/\d+/.test(e.textContent));
    if (!el) return null;
    const m = el.textContent.match(/HP\s+(\d+)\/(\d+)/);
    return m ? { current: parseInt(m[1]), max: parseInt(m[2]) } : null;
  }

  /** Get current engine tick — store is authoritative, DOM is a fallback. */
  function getTick() {
    const storeVal = window.__getState?.()?.currentTick;
    if (typeof storeVal === 'number') return storeVal;
    const el = Array.from(document.querySelectorAll('#root *'))
      .find(e => e.childElementCount === 0 && /^tick \d+/.test(e.textContent.trim()));
    return el ? parseInt(el.textContent.match(/tick (\d+)/)[1]) : 0;
  }

  /** Parse total damage dealt to enemies from a batch of output lines. */
  function parseDamage(lines) {
    let total = 0;
    for (const line of lines) {
      // Ability multi-hit: "12 (3 hits)"
      const multi = line.match(/(\d+)\s*\(\d+ hits\)/);
      // Ability single: ": 19 damage"
      const abilityDmg = line.match(/:\s*(\d+)\s*damage/);
      // Basic attack: "strike ... for 4" or "for 4."
      const strikeDmg = line.match(/\bfor\s+(\d+)[. (]/);
      // Kill line basic attack: "for 4. The ... slain"
      const killDmg = line.match(/\bfor\s+(\d+)\.\s/);

      if (multi) total += parseInt(multi[1]);
      else if (abilityDmg) total += parseInt(abilityDmg[1]);
      else if (killDmg) total += parseInt(killDmg[1]);
      else if (strikeDmg) total += parseInt(strikeDmg[1]);
    }
    return total;
  }

  /** Returns true if the game-over screen has replaced the terminal. */
  function isGameOver() {
    return document.body.textContent.includes('YOU DIED');
  }

  /** Check if the fight ended — returns 'won', 'lost', or null. */
  function checkFightEnd(lines) {
    const text = lines.join('\n').toLowerCase();
    if (text.includes('slain')) return 'won';
    if (text.includes('you die') || text.includes('you have died')) return 'lost';
    // Game-over screen check is last — avoids false positives from stale DOM state
    if (lines.length === 0 && isGameOver()) return 'lost';
    return null;
  }

  /** Check if a command failed (bad direction, on cooldown, no targets, etc.). */
  function isCommandFailed(lines) {
    return lines.some(l => l.startsWith('⚠'));
  }

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!window.__gameCmd || !window.__rewindToTick) {
    console.error('Missing globals. Load Iron & Blood + Vanguard first, then paste this script.');
    return;
  }

  // ── Strategy Definitions ───────────────────────────────────────────────────
  //
  // Each strategy is a function(turn, ctx) → string
  //   turn: 0-indexed turn number within this fight
  //   ctx:  { abilitiesUsed: Set<string>, lastLines: string[] }
  //
  // The four Vanguard abilities:
  //   'trench charge'  — 12 base damage, single hit
  //   'iron press'     — 4 base damage × 3 hits (12 total)
  //   'bayonet drive'  — 9 base damage, single hit
  //   'bulwark stance' — no damage, grants defense_up for 3 turns

  const STRATEGIES = {

    'Pure Attack': () =>
      'attack',

    'Trench Charge Lead': (turn) =>
      turn === 0 ? 'trench charge' : 'attack',

    'Iron Press Lead': (turn) =>
      turn === 0 ? 'iron press' : 'attack',

    'Bayonet Drive Lead': (turn) =>
      turn === 0 ? 'bayonet drive' : 'attack',

    'Bulwark → Attack': (turn) =>
      turn === 0 ? 'bulwark stance' : 'attack',

    'Ability Rotation (TC → IP → BD)': (turn) => {
      const rotation = ['trench charge', 'iron press', 'bayonet drive'];
      return rotation[turn % 3];
    },

    'Bulwark → Ability Rotation': (turn) => {
      if (turn === 0) return 'bulwark stance';
      const rotation = ['trench charge', 'iron press', 'bayonet drive'];
      return rotation[(turn - 1) % 3];
    },

    'Double Ability Open (TC + IP)': (turn) => {
      if (turn === 0) return 'trench charge';
      if (turn === 1) return 'iron press';
      return 'attack';
    },

    'All Abilities First': (turn) => {
      const abilities = ['bulwark stance', 'trench charge', 'iron press', 'bayonet drive'];
      return turn < abilities.length ? abilities[turn] : 'attack';
    },

    'Bulwark → Heavy Hits (BD + TC)': (turn) => {
      if (turn === 0) return 'bulwark stance';
      return turn % 2 === 1 ? 'bayonet drive' : 'trench charge';
    },

  };

  // ── Setup: navigate to Trench Alpha ────────────────────────────────────────

  console.log('── Vanguard Fight Simulator ──────────────────────────────────');

  // ── Restore a playable state ───────────────────────────────────────────────
  // Recovery handles three bad-state cases:
  //   1. No character (rewound past become_vanguard) → rewind to maxTick
  //   2. Player dead (game-over screen) → scan backward for last living tick
  //   3. Player dead but still in terminal (hp=0 in store) → same scan
  {
    let s = window.__getState?.() ?? {};

    // Case 1: no character at all — restore from event log end
    if (!s.playerCharacter && (s.maxTick ?? 0) > 0) {
      console.log(`No character found — restoring from maxTick=${s.maxTick}...`);
      window.__rewindToTick(s.maxTick);
      await sleep(400);
      s = window.__getState?.() ?? {};
    }

    // Case 2/3: character exists but dead — scan backward for last alive tick
    if (s.playerCharacter && s.playerCharacter.hp <= 0) {
      console.log('Player is dead — scanning for last living tick...');
      let liveTick = (s.maxTick ?? 1) - 1;
      while (liveTick > 0) {
        window.__rewindToTick(liveTick);
        await sleep(80);
        const check = window.__getState?.() ?? {};
        if (check.playerCharacter?.hp > 0) break;
        liveTick--;
      }
      await sleep(300);
      s = window.__getState?.() ?? {};
    }

    if (!s.playerCharacter || s.playerCharacter.hp <= 0) {
      console.error('Could not find a living character. Load Iron & Blood + Vanguard first.');
      return;
    }
    console.log(`Character ready: ${s.playerCharacter.name} (${s.playerCharacter.hp}/${s.playerCharacter.max_hp} HP)`);
  }

  // Teleport directly to the fight room — no navigation needed.
  // dev goto is logged in the event log so rewinds correctly restore the room.
  const FIGHT_ROOM = 'trench_alpha';
  console.log(`Teleporting to ${FIGHT_ROOM} via dev goto...`);
  const gotoLines = await cmd(`dev goto ${FIGHT_ROOM}`, 250);
  if (isCommandFailed(gotoLines)) {
    console.error(`[DEV] dev goto failed. Build the WASM first. Output: ${gotoLines.join(' ')}`);
    window.__fightSimRunning = false;
    return;
  }

  const preFightTick = getTick();
  const preFightHp = getHp();

  // Verify enemies are present in the room description
  const allText = gotoLines.join('\n');
  const enemiesPresent = allText.includes('Hostile') || allText.includes('⚔');
  if (!enemiesPresent) {
    console.warn('No enemies detected — check that the room has spawned enemies.');
  }

  console.log(`Pre-fight state: tick ${preFightTick} | HP ${preFightHp?.current}/${preFightHp?.max}`);
  console.log(allText.split('\n').find(l => /^[A-Z]/.test(l)) ?? FIGHT_ROOM);
  console.log('');

  // ── Run each strategy ──────────────────────────────────────────────────────

  const results = [];

  for (const [name, stratFn] of Object.entries(STRATEGIES)) {
    // Rewind to just before the fight
    window.__rewindToTick(preFightTick);
    await sleep(350);

    const hpBefore = getHp();
    const runLog = [];
    let turn = 0;
    let outcome = null;
    let totalDamageDealt = 0;
    let failedCommands = 0;
    const abilitiesUsed = new Set();

    for (let safety = 0; safety < 40 && !outcome; safety++) {
      const ctx = { abilitiesUsed, lastLines: runLog[runLog.length - 1]?.lines ?? [] };
      const command = stratFn(turn, ctx);

      const lines = await cmd(command, 120);
      const damageThisTurn = parseDamage(lines);
      totalDamageDealt += damageThisTurn;

      const failed = isCommandFailed(lines);
      if (failed) failedCommands++;

      // Track ability usage
      if (command !== 'attack' && !failed) abilitiesUsed.add(command);

      runLog.push({
        turn,
        command,
        lines,
        damage: damageThisTurn,
        failed,
      });

      outcome = checkFightEnd(lines);
      turn++; // Always advance turn — don't loop forever on persistent failures
    }

    const hpAfter = getHp();
    const tickAfter = getTick();

    const result = {
      strategy: name,
      outcome: outcome ?? 'timeout',
      turns: turn,
      ticksUsed: tickAfter - preFightTick,
      hpStart: hpBefore?.current ?? '?',
      hpEnd: hpAfter?.current ?? '?',
      hpLost: (hpBefore?.current ?? 0) - (hpAfter?.current ?? 0),
      totalDamageDealt,
      failedCommands,
      abilitiesUsed: [...abilitiesUsed],
      log: runLog,
    };
    results.push(result);

    const icon = outcome === 'won' ? '✓' : outcome === 'lost' ? '✗' : '?';
    console.log(
      `${icon} [${name}]\n` +
      `  outcome: ${outcome ?? 'timeout'} | turns: ${turn} | HP: ${hpBefore?.current}→${hpAfter?.current} (-${result.hpLost}) | dmg dealt: ${totalDamageDealt}` +
      (failedCommands > 0 ? ` | failed cmds: ${failedCommands}` : '')
    );
  }

  // ── Summary Table ──────────────────────────────────────────────────────────

  console.log('');
  console.log('── RESULTS (sorted by turns to win) ─────────────────────────');

  const winners = results.filter(r => r.outcome === 'won').sort((a, b) => a.turns - b.turns);
  const others = results.filter(r => r.outcome !== 'won');

  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);

  console.log(
    pad('STRATEGY', 38) +
    pad('RESULT', 8) +
    lpad('TURNS', 6) +
    lpad('HP LOST', 9) +
    lpad('DMG OUT', 9) +
    '  ABILITIES'
  );
  console.log('─'.repeat(90));

  for (const r of [...winners, ...others]) {
    const icon = r.outcome === 'won' ? '✓' : r.outcome === 'lost' ? '✗' : '?';
    console.log(
      pad(r.strategy, 38) +
      pad(`${icon} ${r.outcome}`, 8) +
      lpad(r.turns, 6) +
      lpad(r.hpLost, 9) +
      lpad(r.totalDamageDealt, 9) +
      '  ' + (r.abilitiesUsed.length ? r.abilitiesUsed.join(', ') : 'none')
    );
  }

  if (winners.length >= 2) {
    const fastest = winners[0];
    const mostEfficient = [...winners].sort((a, b) => a.hpLost - b.hpLost)[0];
    console.log('');
    console.log(`Fastest to win:          ${fastest.strategy} (${fastest.turns} turns)`);
    console.log(`Least HP lost:           ${mostEfficient.strategy} (-${mostEfficient.hpLost} HP)`);
  }

  window.__fightSimResults = results;
  window.__fightSimRunning = false;
  console.log('\n✓ Done. Results in window.__fightSimResults');
  return results;
})();
