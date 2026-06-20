import json

NPC_DIR = "worlds/iron-and-blood/npcs"

ADDITIONS = {
    "captain_vale": [
        {
            "keyword": "morning",
            "prompt": "what the morning of the Day was like in the cave",
            "response": "He looks at the fire. He has been looking at the fire on both sides of it for seven years. 'I was here,' he says. 'Where else would I be.' He means this literally -- in seven years he has left this cave four times, all of them for supply runs that couldn't be delegated. 'Terran side and Aetherian side of the same fire. Same fire every night. Both sides cease. Both sides start again.' He pauses. 'The morning of the Day, both sides stopped and did not start again.' He says it the way you say something that has been building for a long time and has finally arrived. 'Not the ceasefire. That happens every night. This was different. Both sides stopped, and looked at each other across the line, and some of them crossed it.' He is quiet for a long time. 'I have been in this cave for seven years watching that line. No one crossed it outside the ceasefire in seven years. That morning, twelve people crossed it by midday, in both directions, and nobody stopped them.' He looks at the fire. 'I said yes. To the offer. Before the sun was up.' He pauses. 'The letters I've been writing for seven years -- I send them to both sides. I have correspondents on both sides. People I've never met who write to me because I am the person in the cave who sees both.' He looks at the fire. 'Two of my Terran correspondents and three of my Aetherian correspondents crossed the line that morning. In the same direction. They met in the middle.' He is quiet. 'One of them sent me a letter afterward. She said: I went to see if it looked different from the middle. It does.' He looks at the fire. 'I would like to see that one day. I'm not ready to leave the cave yet. But I would like to see it.'",
            "requires_quest_complete": "the_day_arrives",
            "disposition_delta": 15
        }
    ],
    "vespa": [
        {
            "keyword": "day",
            "prompt": "what you felt on the morning everything changed and what the Discarded have decided",
            "response": "She is very still. The Story-Keeper's stillness is different from other people's stillness -- it has a quality of attention in it that you feel rather than observe. 'I have been keeping the stories of the Discarded for thirty years,' she says. 'I have the accounts of everyone who came here. What they left behind. What they brought with them. What they understood when they arrived that they didn't understand before.' She looks at the camp. 'The morning of the Day. I was at the memory circle. I go every morning before the others are awake because the stories need maintenance -- the oral record requires attention, active recall, or they thin.' She pauses. 'The offer came while I was reciting. I was in the middle of the account of the third family that came to this camp, thirty years ago, when the woman said: we couldn't stay in Ironhaven and we couldn't leave Terra and so we came here.' She is quiet. 'The offer arrived. And I finished the sentence. Because the account was in progress and you do not stop an account in the middle.' She almost smiles. 'Then I said yes.' She looks at the camp. 'The Discarded have been making their own decisions since the Wastes were the Wastes. We don't do things by consensus -- we do things by discussion, which is different.' She pauses. 'We discussed it. For two days. Some of us said yes immediately. Some of us said: we came here because every other available connection was coercive. We are not accepting a new one without understanding it first.' She nods. 'Both positions are correct. The offer does not expire. The discussion continues.' She looks at you. 'The story I am keeping about this time is longer than any other I have kept. It has more voices. Some of them are saying yes and some are still deciding and all of them are part of the same account.' She is quiet. 'That is the shape of the Discarded. Always has been.'",
            "requires_quest_complete": "the_day_arrives",
            "disposition_delta": 14
        }
    ],
    "starsmith": [
        {
            "keyword": "craft",
            "prompt": "what you make here and what the crystal-resonance metalworking does",
            "response": "She sets down the work -- it is not quite a tool, not quite a weapon, something designed for a purpose you cannot immediately identify. 'I make things that interface with the lattice,' she says. 'Resonance-attuned instruments. Equipment for reading the crystal layer below the surface layer. Detection tools. Some of what the divers use, some of what the Deep Iron uses for their deeper tunnels.' She picks up the piece and holds it to the light. 'The Elder People did this. Not what I do exactly -- what I do is a reconstruction, educated guesses from fragments and what I can learn empirically by working the crystal itself.' She looks at it. 'The forge name is a simplification. What I actually do: I learn from the crystal what it wants to become and then I make it become that. The Kaelen designs taught me to listen before I shape. Crystal-resonance metalworking is not imposing a form. It is finding the form that the material is already trying to become.' She sets the piece down. 'The Elder People understood this. They built their instruments as collaborations -- material and maker, each informing the other. What I make is rougher than their work. I am working from first principles, not from full knowledge.' She looks at the work in progress. 'Since the Grid is whole, the crystal I work with is different. It is at full resonance instead of partial. What it wants to become has changed.' She picks up a tool. 'I am still learning what it wants. It is a new conversation. I find I am looking forward to it.'",
            "disposition_delta": 11
        },
        {
            "keyword": "whole",
            "prompt": "what the Grid being whole has changed about the forge and the work",
            "response": "She stops working. Not because the question requires stopping -- because the material does. She sets the piece down. 'Three days after the Day, I was working a crystal seam piece, standard type, the kind I've worked a thousand times.' She holds up the piece. 'It did something I hadn't encountered before. It resonated at a frequency I didn't recognize. Not the baseline I'd calibrated to. Not the Aetherium-disruption frequency. Something older.' She looks at the piece. 'I spent two days identifying it. The Elder People's construction frequency. The baseline the Grid was built on. I had seen it in documentation. I had never heard it in material I was working.' She sets the piece down carefully. 'The crystal in the forge has been ambient-resonating at the disrupted frequency for as long as I have been working here. The disruption was the background, the air I worked in. The material responded to it. What I made reflected it.' She pauses. 'Now the material is resonating at the construction frequency. Three hundred years of disruption gone overnight. The crystal I am working with now is not the crystal I have been working with for twenty years.' She looks at the work in progress. 'What I make has changed. I am still working out how. The material tells me when I listen.' She picks up a tool. 'Kaelen told me once that the work is a conversation. I thought I understood that. I am finding out that I understood it partially.' She begins to work again. 'A full conversation is different from a partial one. More demanding. More honest.' She pauses. 'I am glad of it.'",
            "requires_quest_complete": "the_day_arrives",
            "disposition_delta": 13
        }
    ],
    "grimka": [
        {
            "keyword": "gathered",
            "prompt": "what people did when the offer came and where they went",
            "response": "She is watching the bone fields still, but something about the watch has changed since you last spoke with her. Not in the direction -- she is still watching toward the fields. In the quality of it. The watch of someone observing rather than guarding. 'The circle,' she says. 'The memory circle, in the old center of the camp. Vespa was already there -- she said afterward she had been there since before dawn, doing the morning recitation.' She looks at the fields. 'By midday there were forty people at the circle. People who hadn't spoken to each other since the argument over the eastern expansion two years ago. People from the three different Discarded communities who have been in separate orbit since the spire incident.' She pauses. 'Nobody organized it. Nobody called a meeting. People just started walking in the same direction.' She is quiet. 'I didn't go to the circle. I came here.' She looks at the bone fields. 'I've been coming here every morning for two years. Watching. Trying to understand what happened to the people who are there.' She pauses. 'The morning of the Day, there were seven people crossing the fields. Not Discarded -- three from the Aetherian side, four from the Terran side. Walking toward each other from opposite ends.' She watches. 'They met in the middle. They stood there for a while. Then they walked back.' She is quiet. 'I watched the whole thing. I didn't go out. I'm not ready.' She looks at the fields. 'But I'm watching differently now. Less like something is wrong with those fields. More like something is beginning in them.' She pauses. 'Vespa says the beginning has been happening for three hundred years and I just didn't have the frame for it. She might be right.'",
            "requires_quest_complete": "the_day_arrives",
            "disposition_delta": 12
        }
    ],
    "sister_chroma": [
        {
            "keyword": "resonance",
            "prompt": "what you felt at the sanctuary when the Grid was whole",
            "response": "She has been waiting for this question, in the way she waits for things: without impatience, with the quality of someone who knows something is coming and is prepared to meet it. 'The communion sanctuary is built on a crystal lattice point,' she says. 'You may not have known that. I knew it. The sanctuary has been in communication with the lattice for two hundred years, which is when it was built and when the builders understood what they had built on.' She closes the book she has been not-reading. 'The communion is not a religious practice in the conventional sense. It is an attuning. The sanctuary creates conditions for the lattice's frequency to be perceptible to unmodified human senses.' She is quiet. 'Most people who come here perceive something but cannot name it. I perceived it clearly for the first time twelve years ago, which is when I understood what the sanctuary was built to do.' She pauses. 'The morning of the Day, the sanctuary was different in a way that I had not anticipated, which is unusual. I had anticipated many things.' She looks at the crystal in the sanctuary walls. 'The frequency was complete. For twelve years I have been attuning to a frequency with something missing from it. The way a sentence without its final word is still a sentence but is also waiting.' She is quiet. 'The morning of the Day, the sentence finished.' She looks at the walls. 'I said yes immediately. Then I spent the rest of the day sitting with what yes had opened into. That part I had not anticipated either.' She looks at you. 'The sanctuary is receiving visitors differently now. Some people come in and hear something immediately. That did not happen before.' She pauses. 'The communion is working as intended. For the first time in three hundred years.'",
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
