// Faelan's backstory and traits, seeded onto the Lore page. Editable in the app afterwards.
import type { Lore } from '../shared/types';

export const FAELAN_LORE: Omit<Lore, 'updatedAt'> = {
  sections: [
    {
      id: 'who-he-is',
      title: 'Who he is',
      body: `A forest gnome of about a hundred and fifty winters, middle-aged for his kind. Faelan has never had a home. He walks the old forests and wild roads and sleeps wherever the moss is softest. Ask what he's looking for and he looks puzzled: "Looking for? Nothing. I'm just going."`,
    },
    {
      id: 'the-long-quiet',
      title: 'The long quiet',
      body: `Wandering alone for years, Faelan took to talking to himself: narrating his walks, arguing about mushrooms. One day, in all that talking, he simply decided he had magic, said so firmly, and the forest agreed. Seedlings leaned toward him and bruises faded under his hands.

The magic is truly his own. Since it came from talking, not study, he has no idea it should look like anything. He steadies an ally with one finger and a kind word. Ask why nothing glowed and he blinks: "Was it supposed to sparkle?"`,
    },
    {
      id: 'the-red-hat',
      title: 'The red hat',
      body: `He says he found his slightly too-grand red hat lying in the forest. True, as far as it goes. It belongs to a fey noble, one of the ageless lords of the Feywild, and to the fey a thing taken is a debt.

- Omens: flowers bloom out of season where he sleeps; mushroom rings appear around his bedroll.
- Messengers: a fox that speaks too formally, a moth that bows, with polite and unsettling reminders.
- He doesn't notice. He thanks the fox and compliments the mushrooms. The party may notice first.`,
    },
    {
      id: 'old-companions',
      title: 'Old companions',
      body: `Faelan has travelled with many parties. Most partnerships ended when he forgot he was in one and wandered off. Once, sent to drive off a troll, he was found sharing stew with it and planning a dinner for the whole group. The miller did not pay.

Why he travels with this party is for the campaign to tell. What he wants: nothing, really. He just wanders.`,
    },
    {
      id: 'threads',
      title: 'Threads for the DM',
      body: `- Who is the fey noble, and what will they ask for the hat?
- Is the troll still waiting for that dinner?
- What happens when politeness stops working?`,
    },
  ],
  traits: {
    personality: [
      'Chatty in bursts: hours of silence, then a flood of words about a beetle or a well-shaped stick.',
      'Socially awkward: warm, but misses cues and stops mid-conversation to listen to a bird.',
      'Prefers squirrels: would rather talk to one than a person, and passes on its opinions.',
      'Sees good in everyone: even monsters can be bargained with, or offered tea.',
    ],
    ideals: [
      'Everyone can be reached: a kind word and a fair bargain will do it.',
      "Help is just help: it needn't be seen, thanked or sparkly.",
    ],
    bonds: [
      'The road: the closest thing he has to a home.',
      'His red hat: very dear to him, and far more trouble than he knows.',
    ],
    flaws: [
      'Too trusting: will negotiate with things that want to eat him.',
      'Wanders off: mid-quest, or mid-sentence.',
      'Oblivious: has not noticed the fey closing in.',
    ],
  },
};
