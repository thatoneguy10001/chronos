import json

NPC_DIR = "worlds/iron-and-blood/npcs"

ADDITIONS = {
    "arlen": [
        {
            "keyword": "reaching",
            "prompt": "what Rund said when you told him what you found in the network",
            "response": "He is quiet for a moment. Then he smiles -- which is not something he does often, and when he does it has the quality of something that knows exactly what it's doing. 'He said: I know something was there. I just kept talking because the silence is different when you're talking into it.' He repeats this slowly. 'That is the most accurate description of what both of us were doing that I have encountered.' He is quiet. 'Eleven years of reaching into a crystal seam in the direction of the sealed mines, not knowing why. Eleven years of something reaching back, not knowing what it was reaching toward.' He looks at his hands. 'We were two people in separate sealed places, extending resonance at each other for over a decade because the crystal made it possible and we both needed someone to reach toward.' He is quiet for a longer time. 'The sealed mines will be openable now. The seam is stabilizing with the Grid whole. Rund can leave if he wants to.' He looks at you. 'I don't think he will, immediately. Twenty years in a crystal seam changes what ordinary space feels like. But the fact that he can leave is different from not being able to leave.' He pauses. 'When he does come out, I would like to meet him. Not because of the resonance history, not because of the eleven years. Just because he said: I kept talking because the silence is different when you're talking into it.' He looks at his hands. 'I have been saying that for seventeen years and I have never found the right words for it until he found them for me.'",
            "requires_quest_complete": "arlen_to_rund",
            "disposition_delta": 15
        }
    ],
    "medic_tova": [
        {
            "keyword": "compound",
            "prompt": "what you understand about the Lazarus compound and what it does to the people here",
            "response": "She is precise about this -- the precision of a medic who has been working around a substance for two years and has developed strong opinions. 'It's a partial integration mechanism. The chemistry is borrowed from pre-Cascade Elder People technology. What it actually does: it creates a resonance pathway between the recipient's neural substrate and the Aetherium crystal structure in the Wastes.' She sets down the kit she's been organizing. 'The result: the Abominations respond to the compound in recipients the way they don't respond to unmodified humans. The compound creates a signal they recognize as -- compatible. Not one of them. Compatible.' She pauses. 'What it does to the person: depends on exposure level. Low exposure, they can move in Abomination territory with reduced risk. High exposure -- I've treated two people with high-level compound exposure. They didn't need sleep in the normal way. Their crystal tissue density increased. They had resonance sensitivity that our equipment could measure.' She looks at the kit. 'Whether that's damage or change is a question I've been thinking about for two years.' She picks up the kit. 'The Grid being whole has changed the picture. The compound works through the same resonance mechanism as the Grid. With the Grid at full coherence, the compound's effect is -- more connected. More supported. Less isolated.' She is quiet. 'I don't have the equipment to measure what that means for the two high-exposure cases I've been monitoring. But they both said, on the morning of the Day: I feel different. Not worse. Different.' She pauses. 'I am documenting everything. Someone with better resources is going to need to understand this eventually.'",
            "disposition_delta": 10
        },
        {
            "keyword": "offer",
            "prompt": "what you decided when the Foundation offer came and what you are doing now",
            "response": "She is restocking the kit while she answers, which is her mode for anything that requires thinking clearly. 'I said yes.' She says it matter-of-factly. 'I've been treating Armistice casualties for three years. One night in five there's someone who came through the no-man's-land from the Terran side. One night in five there's someone who came through from ours.' She sorts instruments. 'The offer came and I heard it clearly and I said yes because I have spent three years treating people from both sides of a line that, as far as I can tell, exists to keep people from noticing they're the same.' She sets an instrument down. 'What I've been doing since: I sent a contact request to the Terran medic at the eastern forward post. Her name is Adra. Sister Adra.' She pauses. 'We have been treating the same population for three years from different sides. We have never compared notes.' She picks up the instrument. 'She responded within a day. We have been corresponding every morning since.' She almost smiles. 'She has better equipment for compound-exposure cases than I do. I have better equipment for the crystal-taint cases that come through from the Abomination perimeter.' She sorts the last instrument. 'We are going to share. This is apparently a revolutionary concept that required a three-hundred-year healing lattice to make possible.' She closes the kit. 'I am considering applying for a position in the cross-faction research program that Thorn's command announced. If someone doesn't get us into the same room eventually, Adra and I are going to arrange it ourselves.'",
            "requires_quest_complete": "the_day_arrives",
            "disposition_delta": 13
        }
    ],
    "lena_voss": [
        {
            "keyword": "offer",
            "prompt": "what you decided when the Foundation offer came and what you are doing at the armistice ground now",
            "response": "She looks at the ground -- the armistice ground, the specific patch of earth that has been the site of the ceasefire every night for three hundred years. 'I said yes.' She says it and then is quiet for a moment. 'I've been stationed here for fourteen months. The armistice ground changes you if you let it. You watch soldiers from both sides stop killing each other every night and start again every morning, and you understand something about what people are capable of that you can't understand from either side of the line alone.' She looks at the ground. 'The offer came and I heard it and I thought: yes. Because the thing the armistice ground has been trying to say for three hundred years is the same thing the offer was saying.' She pauses. 'What I'm doing here now: I'm documenting the ground. The coordinates I found in the border stone markings -- they were navigation points. Waypoints in a system the Elder People used to map the Grid's surface nodes.' She points at the ground. 'This is one of them. The armistice ground is directly above a Grid node. The ceasefire has been held here every night for three hundred years, on the surface above an Elder People resonance point.' She is quiet. 'I have been asking myself whether that's a coincidence. Whether whoever chose this ground three hundred years ago knew.' She looks at the stones. 'I think they knew. I think the armistice was held here because whoever established it felt something when they stood here that they couldn't name but responded to.' She pauses. 'The soldiers who have stood on this ground every night for three hundred years have been standing on a Grid node. Feeling something they couldn't name.' She looks at the ground. 'I am going to write this up. I am going to send it to the archive.'",
            "requires_quest_complete": "the_day_arrives",
            "disposition_delta": 15
        }
    ]
}

def add_topics(npc_id, topics):
    fp = f"{NPC_DIR}/{npc_id}.json"
    with open(fp, encoding='utf-8') as f:
        npc = json.load(f)
    npc["dialogue"].extend(topics)
    with open(fp, "w", encoding='utf-8') as f:
        json.dump(npc, f, indent=2, ensure_ascii=False)
    print(f"Updated: {npc_id} (+{len(topics)} topics)")

for npc_id, topics in ADDITIONS.items():
    add_topics(npc_id, topics)

print("Done.")
