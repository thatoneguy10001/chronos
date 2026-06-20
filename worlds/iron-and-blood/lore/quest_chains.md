# Iron & Blood — Quest Chain Design

## Status Key
- ✅ IMPLEMENTED — quests exist, tests pass
- 🔨 IN DESIGN — being actively worked on
- 📋 PLANNED — design notes exist, not yet built

---

## Chain 1: Blood and Memory ✅
**Theme:** How war wears down any person. Universal, not Lazarus-specific.
**Anchor:** Ren's diary — anonymous soldier, found on a cot by Adra.
**Mechanic:** Diary is a persistent inventory item. 5 Ren entries unlock as chain progresses. 5 player entries written in different ink at key emotional beats. `examine diary` renders current contents.
**Scope:** 23 quests across 4 acts, game-spanning.
**Acts:**
- Act 1 (field hospital): bam_the_patient
- Act 2 (Hive / black market / crystal structure): bam_gray_market_price → bam_what_she_dreamed → bam_sevyas_says_yes → bam_crystal_structure → bam_elder_fragment → bam_ministry_canister
- Act 3 (maintenance tunnels / sunken city / Thorn): bam_where_it_drifts → bam_maintenance_tunnels → bam_brother_kell → bam_sergeants_gift → bam_what_thorn_knows → bam_coordinates
- Act 4 (resolution): bam_last_visit → bam_networks_edge → bam_whatever_thorn_decides → bam_sealed_order
**Giver:** Sister Adra throughout.
**Connects to:** Chain 6 (Thorn's arc echoes Ren's). Hope mechanic (Blood and Memory completion contributes to Hope).

---

## Chain 2: The Lazarus Dossier 📋
**Theme:** Stone built it, she knows it's wrong — what does she do about it?
**Central question:** Moral responsibility for a creation that was taken and warped.
**Key beats:** TBD
**Connects to:** The Lazarus modification secret. Kehl's "modification" topic reveals the name Stone knows.

---

## Chain 3: The Monastery Record 📋
**Theme:** The Elder People left a complete account. Kell has almost finished reading it.
**Central question:** What did the Elder People learn, and is it in time?
**Key revelation:** The Armistice of Silence was designed, not emergent. The Silent are introduced.
**Key beats:** TBD
**Connects to:** Chain 5 (Armistice Hour — The Silent's role). Chain 5 (Armistice designed by Elder People).

---

## Chain 4: The Ministry's Arithmetic 📋
**Theme:** Vane isn't evil, he's mathematical — but his math keeps producing bodies.
**Central question:** At what point does pragmatism become complicity?
**Key beats:** TBD
**Connects to:** The Lazarus modification (authorization above Vane). Despair mechanic — Vane's choices affect it.

---

## Chain 5: The Armistice Hour ✅
**Theme:** Brief cooperation across enemy lines — hope that gets extinguished by morning.
**Mechanic:** Hope/Despair counters (integer WorldFlags). Hope increases via Armistice cooperation. Despair increases via inaction, broken ceasefire, war choices. Both independent — can have high of both.
**Hope thresholds:**
- 0-2: Default grim state. Thorn has 2 ending options.
- 3-5: Adra mentions she slept. Thorn stands straighter. Front line described as quiet.
- 6+: Mirror develops genuine relationship. Moss says Lower Rigs are talking differently. Thorn gets third ending option.
**Despair thresholds:**
- 0-2: Default.
- 3-5: Thorn loses "walk out" ending. Adra stops mentioning Armistice.
- 6+: Mirror stops appearing. Abominations hit harder.
**The Mirror:** Lena Voss — Aetherian field medic in armistice_ground. Has been crossing most nights for two years. Knows Elder People naming conventions (the carved name on the border stone is an Elder personal designation).
**Time-gating:** armistice_ground accessible only at night (requires_night: true on windward_approach north exit). `wait` command skips to next dusk/dawn.
**The Silent connection:** The Armistice has never become peace because The Silent have a stake in the war continuing. Lena may know something about this from the Aetherian side.
**Main chain:** ah_runner_network → ah_before_dusk → ah_first_crossing → ah_medic_exchange → ah_what_she_carries → ah_cooperative_hunt → ah_body_between → ah_the_watcher → ah_mirror_speaks → ah_cross_faction_signal → ah_lena_knows → ah_coordinates
**Nightly pool:** ah_pool_shared_meal, ah_pool_medical_exchange, ah_pool_abomination_warning, ah_pool_name_on_wall, ah_pool_until_dawn
**Key open question:** Does the Aetherian side have their own Lazarus / Hollow problem? Lena's "compound" topic hints yes.

---

## Chain 6: Thorn's Two Years 📋
**Theme:** Two years left, still commanding, still signing orders. How does he want to spend them?
**Mechanic:** Three endings (see secrets.md). Player choices and Hope level gate which are available.
**Connects to:** Blood and Memory (Thorn reads the diary). Hope mechanic. Chain 2 (Stone's documentation option).

---

## Chain 7: The Shell Crater 📋
**Theme:** Short chain. A camp abandoned in a hurry, 30 feet underground.
**Central question:** Who abandoned it and why?
**Key beats:** TBD
**Estimated scope:** 3-4 quests. Good entry point if scope gets large.

---

## Chain 8: The Discarded 📋
**Theme:** Morlak's people. What were the Wastes before the war?
**Central question:** What did the war erase that nobody remembers anymore?
**Key beats:** TBD
**Connects to:** Morlak's notebooks. The pre-war world neither nation talks about.

---

## Chain 9: The SCAMP Engineers 📋
**Theme:** 12 people built the weapon that made this war permanent. Where are they now?
**Central question:** What do you do with people who made an irreversible mistake?
**Key beats:** TBD
**Connects to:** The war's 330-year length — was it always going to be this long, or did something make it permanent?

---

## Cross-Chain Dependencies

| Chain | Requires | Unlocks |
|-------|----------|---------|
| Blood and Memory | — | Hope baseline, Thorn relationship |
| Lazarus Dossier | — | Modification reveal, Stone's role in Chain 6 |
| Monastery Record | — | The Silent revealed, Armistice origin |
| Ministry's Arithmetic | — | Vane's role, authorization chain |
| Armistice Hour | Chain 3 (Silent reveal) | Hope/Despair system, Mirror relationship |
| Thorn's Two Years | Chains 1, 2, Hope level | Thorn's ending |
| Shell Crater | — | Standalone, minor connections |
| The Discarded | — | Pre-war history, feeds into Silent backstory |
| SCAMP Engineers | — | War permanence question |
