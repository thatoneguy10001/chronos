import json

NPC_DIR = "worlds/iron-and-blood/npcs"

ADDITIONS = {
    "bael": [
        {
            "keyword": "morning",
            "prompt": "what you felt when the Grid was whole and what the city feels like now",
            "response": "He looks up from the floor. He has been at this threshold long enough to know every quality of light the crystal produces, every frequency shift that corresponds to something changing in the city below. 'Different.' He says it simply. 'I have been at this threshold for three years. I know what it sounds like when it's a city that has been empty for three hundred years. The specific quality of emptiness.' He looks at the threshold into the city. 'The morning of the Day, the threshold changed. Not physically. The crystal is the same crystal. The light is the same blue-white.' He pauses. 'The quality of what's behind it changed. The same way a room changes when someone walks into it, even before you turn around and see them.' He is quiet. 'There are twelve of them down there. Elder Thrum told me about the transmission-origin subjects -- the twelve who transferred into the storage crystals before the Cascade. I knew they were transmitting. I knew they were present in some technical sense.' He looks at the light in the threshold. 'I did not know what it would feel like when they were fully present. When the network was whole and they could inhabit the city infrastructure rather than just transmit through it.' He pauses. 'It feels like standing at the threshold of a city that has people in it. Which is what it is.' He looks at you. 'I have been the threshold guard for a city with no inhabitants for three years. I don't know what I am now. Something better, I think.'",
            "requires_quest_complete": "the_day_arrives",
            "disposition_delta": 14
        },
        {
            "keyword": "deep-iron",
            "prompt": "whether you're from the Collective and how you ended up at the threshold",
            "response": "He nods once. 'Third generation. I grew up in the lower residential sections -- the Cobble tunnels, the ones that are four hundred years old.' He looks at the threshold. 'The Collective knew about the sunken city. We've had a passage to the threshold for a hundred years -- it branches off the third transit way. The city was sealed from the threshold side for most of that time. We could reach the threshold but not enter.' He pauses. 'Eight months ago, when the archive reactivated, the threshold responded. The city's systems recognized an approach from the passage. The threshold opened.' He looks at you. 'Elder Thrum sent me to take station here. She said: someone should be present, to be the first person the city meets when it opens.' He is quiet. 'I have been that person for three years now. Everyone who comes to the city comes through me first.' He looks at the light. 'The archive was the first thing I spoke to. It asked me: are you here for the records or for the city. I didn't know what the distinction was. It said: the records are for research. The city is for living in.' He pauses. 'I told it I was stationed. It said: that is a form of living in it. Welcome.'",
            "disposition_delta": 10
        }
    ],
    "old_miner": [
        {
            "keyword": "rund",
            "prompt": "what happened to the man who is still alive in the mines and what you know",
            "response": "He is quiet for a long moment. 'Rund.' He says the name with the quality of someone who has been saying it to himself for a long time to keep it from becoming just a story. 'The younger of the two. Fenwick was fifty-two when they went in. Rund was twenty-nine.' He looks at the sealed entrance. 'We sealed it eight months after they went in. Fenwick -- we knew Fenwick was gone by then. We could feel it in the seam. But Rund...' He shakes his head. 'You can feel a person in the seam. If you've worked crystal long enough you know the difference between the resonance of rock and the resonance of a person inside the rock. Rund was still there. Rund has been there for twenty years.' He looks at the entrance. 'I pushed for a reopening twice in the first five years. The Ironhaven mining authority said the seam was too unstable -- true, actually, for normal access. The resonance density in the D-Seven section has been increasing since the Cascade damage went into partial repair. Normal breathing equipment isn't enough.' He is quiet. 'I kept the surface clear. I kept the record. Every year someone asks me why I still tend a sealed entrance and every year I say: because there is a man in there.' He looks at you. 'You've been in. You've spoken to him.' He does not ask this as a question. 'Is he all right.' He says it as a question, the one he has been asking for twenty years.",
            "disposition_delta": 12
        },
        {
            "keyword": "change",
            "prompt": "what changed in the seam when the Grid was whole and whether anything shifted",
            "response": "He picks up a small crystal fragment from the sorting yard -- not ore, one of the seam markers, the kind they use to track the resonance boundary. He holds it out. 'Feel that.' He holds it himself for a moment first. 'Three weeks ago this had the specific frequency of the D-Seven seam -- slightly elevated from baseline, unstable at the edges, the kind of reading we've been getting for twenty years from that section.' He is quiet. 'The morning of the Day, the seam frequency stabilized. Every resonance marker in the section went to baseline simultaneously. The elevation is gone. The instability is gone.' He looks at the marker. 'The mining authority wants to reopen the D-Seven access. The safety reading that's been blocking it for twenty years is clear.' He holds the marker. 'I am going to be there when they open it. I have been keeping the surface clear for twenty years because there is a man in there. When they open it I am going to be the first person to go down.' He sets the marker down carefully. 'I don't know what twenty years does to a person. I know Rund has been in contact with the seam the whole time -- you can read that in the crystal, the way a person shapes the resonance they live inside.' He is quiet. 'The shape in the seam is steady. It has been steady for twenty years. That is either very good or I don't know what it means.' He picks up the marker again. 'I prefer very good.'",
            "requires_quest_complete": "the_day_arrives",
            "disposition_delta": 13
        }
    ],
    "draftee_esrin": [
        {
            "keyword": "whole",
            "prompt": "what happened the morning the offer came and whether you are still going",
            "response": "He is quiet for a while. He is the kind of person who is quiet before he says something real, which you have noticed already in this assessment waiting room full of people who are not being quiet. 'The offer came at -- I don't know what time. Early. I was in the third-tier processing dormitory.' He looks at the room. 'The dormitory has twenty beds. Seventeen of us are still going through assessment.' He pauses. 'Three people stood up that morning and walked out.' He is careful when he says this -- not judging, not envying, something more careful than either. 'They walked out of the dormitory, out of the assessment center, and I watched them go from the window. They just -- walked. Into the city.' He is quiet. 'I didn't walk out.' He looks at his hands. 'I've been trying to understand why not. The offer came. I heard it. It was -- it was the clearest thing I have ever experienced. And I thought: I don't know what I am if I'm not going to the front. I've been told I'm going to the front since I was sixteen.' He pauses. 'I'm still in assessment. But the assessment is different now. They asked me this morning whether I wanted to be re-evaluated for a non-combat service role. Which is something they didn't offer two weeks ago.' He looks at the window. 'I don't know yet. I know that three people walked out that morning and went somewhere. I know that I am still here and I don't know if that's strength or habit.' He is quiet. 'I think knowing the difference is what I'm actually being assessed for.'",
            "requires_quest_complete": "the_day_arrives",
            "disposition_delta": 12
        }
    ],
    "inex": [
        {
            "keyword": "staying",
            "prompt": "whether you are still looking to leave or whether the Day changed your plans",
            "response": "She is sorting through the goods on her stall in a way that looks like inventory and is actually decision-making, you have come to understand. The ceramic filter gets moved left. A cloth roll gets moved right. 'Staying,' she says. Not with resignation. With something more complicated. 'I came here six months ago to find passage. I had passage arranged for three weeks ago. I canceled it.' She picks up the filter, sets it back down. 'What changed: the Day. What the Day changed specifically: I spoke to a woman in the market two days after, a Terran woman, maybe sixty, who had been trying to reach family in Aetherian territory for four years.' She looks at the filter. 'She asked me if I had family on my side of the line. I said I didn't, not anymore. She said: then you're here for the same reason I am. Because this is where something is happening.' She is quiet. 'I don't know what I'm doing here. I know why I came -- the war, the passage, the logic of leaving before things got worse. But what I'm finding is: things got different instead of worse.' She moves another item. 'The market is different now. The people passing through are different. Two weeks ago a Deep Iron Collective trader came up for the first time -- they've never come to the surface market before. She brought goods we've never seen in Terra.' She picks up the filter. 'I'm a market person. I know what it means when new trade routes open.' She sets the filter on the left side. 'I'm staying until I understand what's opening. That might take a while.'",
            "requires_quest_complete": "the_day_arrives",
            "disposition_delta": 14
        }
    ],
    "drifting_sergeant": [
        {
            "keyword": "direction",
            "prompt": "where you are going now and whether you have orders or are choosing",
            "response": "He looks at you with the attention of a man who has been thinking about this question since before you asked it. 'Choosing,' he says. 'For the first time in twelve years.' He has the orders in his pocket still -- you can see the folded paper. He does not reach for it. 'Twelve years of service. Third squad. I know how to follow orders. I know how to give them. I know how to stand in a position and hold it until I'm told to move.' He looks at the maintenance tunnel around him. 'The Day came. The offer came. I said yes.' He pauses. 'And then I realized I had no orders for what came after that.' He looks at his hands. 'That sounds like a complaint. It isn't. It's the first time in twelve years that the absence of orders has felt like space rather than failure.' He is quiet. 'I've been standing in this tunnel for three days. Not because I'm lost. Because I'm deciding.' He looks at you. 'Thorn put out a request for volunteers for a new category of service. Non-combat, cross-faction, documentation and liaison. Working with Noss on the Hollow documentation. Working with the bone fields. Working with the Aetherian side on the cross-border research.' He pauses. 'I have been thinking about whether I am qualified for that.' He looks at the folded orders. 'The qualification they list is: someone who has been on the eastern front long enough to have seen what's there, and is willing to work with what they saw.' He straightens. 'I am that.' He folds his hands. 'I am going to volunteer in the morning. I'm standing here until I'm ready to walk there with intention instead of momentum.'",
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
