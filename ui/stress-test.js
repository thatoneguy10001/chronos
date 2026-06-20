/**
 * Chronos Engine Stress Test Suite
 * Run via: copy-paste into browser console, or preview_eval
 * Covers: parser fuzzing, state edge cases, replay determinism
 */
(async function ChronosStressTest() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Helpers ─────────────────────────────────────────────────────────────
  function getOutputDivs() {
    // Capture both output (line-height) and error (ff6b6b) type lines
    return Array.from(document.querySelectorAll('#root div[style*="line-height"], #root div[style*="ff6b6b"]'));
  }

  async function send(command, waitMs = 80) {
    const before = getOutputDivs().length;
    window.__gameCmd(command);
    await sleep(waitMs);
    const after = getOutputDivs();
    const newDivs = after.slice(before);
    const raw = newDivs.map(d => d.textContent.trim()).join('\n').trim();
    return raw;
  }

  function getSidebarText() {
    return Array.from(document.querySelectorAll('#root *'))
      .filter(el => el.children.length === 0)
      .map(el => el.textContent.trim())
      .filter(t => t.length > 0)
      .join(' ');
  }

  function getTickCount() {
    const el = Array.from(document.querySelectorAll('#root *'))
      .find(el => el.children.length === 0 && /^tick \d+/.test(el.textContent.trim()));
    return el ? parseInt(el.textContent.match(/tick (\d+)/)?.[1] || '0') : 0;
  }

  // ── Results tracker ──────────────────────────────────────────────────────
  const R = { passed: 0, failed: 0, warnings: 0, log: [], issues: [] };

  const PANIC_STRINGS = ['panic', 'unwrap()', 'called `Option', 'RUST_BACKTRACE', 'wasm-function'];

  function check(name, raw, opts = {}) {
    const lower = (raw || '').toLowerCase();
    const panic = PANIC_STRINGS.find(p => lower.includes(p.toLowerCase()));
    const missing = (opts.mustContain || []).find(p => !lower.includes(p.toLowerCase()));

    if (panic) {
      R.failed++;
      R.issues.push(`❌ PANIC   [${name}] triggered by: "${panic}"`);
      R.log.push(`❌ PANIC   [${name}]`);
    } else if (missing) {
      R.failed++;
      R.issues.push(`❌ FAIL    [${name}] missing: "${missing}" — got: "${raw.slice(0, 80)}"`);
      R.log.push(`❌ FAIL    [${name}]`);
    } else if (opts.note) {
      R.passed++;
      R.log.push(`✓  [${name}] — ${opts.note}: "${raw.slice(0, 60)}"`);
    } else {
      R.passed++;
      R.log.push(`✓  [${name}]`);
    }
  }

  function warn(name, note) {
    R.warnings++;
    R.log.push(`⚠  [${name}] — ${note}`);
  }

  // ── Guard: game must be initialized ─────────────────────────────────────
  if (!window.__gameCmd) {
    return { error: 'Run after selecting Iron & Blood + Vanguard. window.__gameCmd not set.' };
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 1 — Parser Fuzzing (fire-and-forget: must not panic or freeze)
  // ════════════════════════════════════════════════════════════════════════
  R.log.push('');
  R.log.push('══ PHASE 1: Parser Fuzzing ══════════════════════════════════');

  const fuzzCases = [
    // Blank / whitespace
    ['empty string',            ''],
    ['single space',            ' '],
    ['tabs and spaces',         '  \t  '],
    // Length extremes
    ['single char: a',          'a'],
    ['single char: /',          '/'],
    ['500-char string',         'x'.repeat(500)],
    ['1000-char string',        'y'.repeat(1000)],
    // Injection / XSS
    ['script tag',              '<script>alert(1)</script>'],
    ['sql injection',           "'; DROP TABLE quests; --"],
    ['html entity',             '&lt;b&gt;bold&lt;/b&gt;'],
    ['json object',             '{"cmd":"attack"}'],
    // Unicode / encoding
    ['emoji only',              '🔥💀⚔️'],
    ['null byte',               '\x00'],
    ['zero-width chars',        '​‌‍'],
    ['rtl override',            '‮'],
    ['cyrillic',                'атака'],
    // Truncated known commands
    ['bare: go',                'go'],
    ['bare: talk',              'talk'],
    ['bare: accept',            'accept'],
    ['bare: ask',               'ask'],
    ['bare: attack',            'attack'],
    ['bare: shop',              'shop'],
    ['bare: use',               'use'],
    // Bad args on valid verbs
    ['go invalid dir',          'go supernova'],
    ['go nowhere',              'go nowhere'],
    ['talk nonexistent npc',    'talk xyzzy_nobody'],
    ['accept nonexistent quest','accept fake_quest_xyz_99'],
    ['use nonexistent item',    'use golden_dragon_sword'],
    ['ask unknown npc',         'ask nobody about everything'],
    ['attack specific nobody',  'attack invisible_man'],
    // Formatting edge cases
    ['extra spaces',            '  go   north  '],
    ['mixed case',              'ATTACK'],
    ['mixed case 2',            'Go North'],
    ['semicolon sep',           'go north; attack'],
    ['pipe sep',                'go north | attack'],
    ['newline in cmd',          'go\nnorth'],
    ['just numbers',            '42'],
    ['negative number',         '-1'],
    ['float',                   '3.14'],
    ['just punctuation',        '!@#$%^&*()'],
    ['path traversal',          '../../../etc/passwd'],
    ['very long direction',     'go ' + 'north '.repeat(50)],
    ['repeated word',           'attack attack attack attack'],
    ['command with equals',     'attack=enemy'],
  ];

  for (const [name, cmd] of fuzzCases) {
    const raw = await send(cmd);
    check(name, raw);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 2 — State Edge Cases
  // ════════════════════════════════════════════════════════════════════════
  R.log.push('');
  R.log.push('══ PHASE 2: State Edge Cases ════════════════════════════════');

  // 2a. Accept same quest twice
  R.log.push('-- 2a. Duplicate quest accept --');
  await send('go north');
  await send('talk commander thorn');
  await send('accept trench sweep');
  const dupAccept = await send('accept trench sweep');
  check('accept same quest twice', dupAccept, { note: 'response' });

  // 2b. Attack in a room with no enemies
  R.log.push('-- 2b. Attack with no enemies --');
  const noEnemyAttack = await send('attack');
  check('attack no enemies in command post', noEnemyAttack, { note: 'response' });

  // 2c. Ability with no enemies
  R.log.push('-- 2c. Ability with no enemies --');
  const noEnemyAbility = await send('iron press');
  check('iron press no enemies', noEnemyAbility, { note: 'response' });

  // 2d. Use item not in inventory
  R.log.push('-- 2d. Use item not in inventory --');
  const badItem = await send('use elixir_of_doom');
  check('use nonexistent inventory item', badItem, { note: 'response' });

  // 2e. Navigate to valid then invalid direction
  R.log.push('-- 2e. Blocked / invalid movement --');
  await send('go south'); // back to gate
  const badDir = await send('go east');   // gate has no east exit
  check('blocked direction', badDir, { note: 'response' });

  // 2f. Ability on cooldown
  R.log.push('-- 2f. Ability on cooldown --');
  await send('go south'); // to trench
  await send('iron press'); // first use, starts cooldown
  const cooldownResult = await send('iron press'); // should be blocked
  check('ability on cooldown', cooldownResult, { note: 'response' });

  // 2g. Combat: overkill (ability for massive damage)
  R.log.push('-- 2g. Combat: multi-attack to kill --');
  let killFound = false;
  for (let i = 0; i < 30; i++) {
    const r = await send(i % 4 === 0 ? 'trench charge' : 'attack', 60);
    if (r.includes('slain') || r.includes('Quest')) {
      killFound = true;
      check('combat kill resolves cleanly', r, { mustContain: ['slain'] });
      break;
    }
    if (r.toLowerCase().includes('you die') || r.toLowerCase().includes('dead')) {
      warn('combat test', 'Player died before killing enemy — reduce enemy stats or increase HP');
      break;
    }
  }
  if (!killFound) warn('combat kill', 'No kill in 30 attacks — something may be wrong with combat resolution');

  // 2h. Quest log after completion
  R.log.push('-- 2h. Quest log state --');
  const questLog = await send('quests');
  check('quest log accessible', questLog, { note: 'state' });

  // 2i. Rapid-fire same command (10 in quick succession)
  R.log.push('-- 2i. Rapid-fire attack (10x with 20ms gap) --');
  let rapidErrors = 0;
  for (let i = 0; i < 10; i++) {
    const r = await send('attack', 20);
    if (PANIC_STRINGS.some(p => r.toLowerCase().includes(p))) rapidErrors++;
  }
  if (rapidErrors > 0) {
    R.failed++;
    R.issues.push(`❌ PANIC   [rapid-fire] ${rapidErrors}/10 commands produced panics`);
    R.log.push(`❌ PANIC   [rapid-fire commands]`);
  } else {
    R.passed++;
    R.log.push(`✓  [rapid-fire 10x attack — no panics]`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Replay Determinism
  // ════════════════════════════════════════════════════════════════════════
  R.log.push('');
  R.log.push('══ PHASE 3: Replay Determinism ══════════════════════════════');

  // Record a sequence of outputs from a fresh point
  // We'll do this by checking if rewind+replay produces the same text
  // The rewind slider resets tick; we replay the same commands
  const replayCommands = [
    'go north',
    'talk commander thorn',
    'go south',
    'go south',
    'attack',
    'attack',
    'iron press',
  ];

  const tickBefore = getTickCount();
  R.log.push(`  Starting at tick ${tickBefore}`);

  // Run sequence and record outputs
  const run1 = [];
  for (const cmd of replayCommands) {
    const out = await send(cmd, 120);
    run1.push(out);
  }
  const tickAfter = getTickCount();
  R.log.push(`  After sequence: tick ${tickAfter}`);

  // Rewind to before the sequence via the store if accessible
  // Try to rewind using store's rewindToTick
  let rewound = false;
  try {
    // Find zustand store via React fiber
    const root = document.querySelector('#root');
    const rk = Object.keys(root).find(k => k.startsWith('__reactFiber'));
    let fiber = root[rk];
    const visited = new Set();
    const queue = [fiber];
    while (queue.length && !rewound) {
      const f = queue.shift();
      if (!f || visited.has(f)) continue;
      visited.add(f);
      if (f.memoizedProps && typeof f.memoizedProps.rewindToTick === 'function') {
        f.memoizedProps.rewindToTick(tickBefore);
        rewound = true;
      }
      if (f.child) queue.push(f.child);
      if (f.sibling) queue.push(f.sibling);
    }
  } catch(e) { /* rewind via fiber failed */ }

  if (!rewound) {
    // Try clicking the rewind slider to tick 0
    R.log.push('  ⚠  Could not access rewindToTick — testing via fresh comparison instead');
    warn('replay determinism', 'Could not rewind via store — manual verification needed');
  } else {
    await sleep(200);
    const run2 = [];
    for (const cmd of replayCommands) {
      const out = await send(cmd, 120);
      run2.push(out);
    }

    let deterministicFails = 0;
    for (let i = 0; i < run1.length; i++) {
      if (run1[i] !== run2[i]) {
        deterministicFails++;
        R.issues.push(`❌ DETERMINISM [cmd: "${replayCommands[i]}"] outputs differ`);
        R.issues.push(`   Run 1: ${run1[i].slice(0, 100)}`);
        R.issues.push(`   Run 2: ${run2[i].slice(0, 100)}`);
      }
    }
    if (deterministicFails === 0) {
      R.passed++;
      R.log.push(`✓  [replay determinism — all ${replayCommands.length} commands matched]`);
    } else {
      R.failed++;
      R.log.push(`❌ [replay determinism — ${deterministicFails}/${replayCommands.length} outputs differed]`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // REPORT
  // ════════════════════════════════════════════════════════════════════════
  R.log.push('');
  R.log.push('══ RESULTS ══════════════════════════════════════════════════');
  R.log.push(`   Passed:   ${R.passed}`);
  R.log.push(`   Failed:   ${R.failed}`);
  R.log.push(`   Warnings: ${R.warnings}`);
  if (R.issues.length > 0) {
    R.log.push('');
    R.log.push('Issues:');
    R.issues.forEach(i => R.log.push('  ' + i));
  }

  console.log(R.log.join('\n'));
  return {
    passed: R.passed,
    failed: R.failed,
    warnings: R.warnings,
    issues: R.issues,
    log: R.log,
  };
})();
