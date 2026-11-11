// Santa's words in his reply (views/Reply.tsx). Every letter used to get the same three paragraphs, and two
// children in one house would notice; now each part has four versions and a letter's own number picks one
// of each, so brothers and sisters almost never get the same reply, and a reply printed twice is the same
// both times. It still promises nothing (invariant 22): no gifts, nothing about what the child asked for,
// no visit. No imports, so Deno can test it as it is (santaReply_test.ts).

export interface ReplyTo {
  first_name: string;
  age: number;
  town: string | null;
}

// `from` is " from Wausau" or nothing, so each opening reads right with or without a town.
const OPENINGS: ((from: string) => string)[] = [
  (from) => `Thank you for your letter! It came all the way${from} to the North Pole, and Mrs. Claus read it out loud to the elves at breakfast.`,
  (from) => `Your letter made it all the way${from} to the North Pole. I read it twice by the fire: once for me, and once out loud for the reindeer.`,
  (from) => `What a fine letter! The mail elf carried it in${from} with the morning post, and everyone in the workshop stopped to listen.`,
  (from) => `Thank you for writing to me${from}. Your letter was on top of the mailbag this morning, and I read it before my cocoa got cold.`,
];

const MIDDLES = [
  "The elves are busy in the workshop, the reindeer are practicing their landings, and your letter is pinned to the wall where I can see it every day.",
  "It is a busy season up here. The elves sing while they work, Rudolph is polishing his nose, and your letter has a place of its own on my desk.",
  "Snow is falling outside my window as I write. The reindeer are stretching their legs, Mrs. Claus is baking, and I have tucked your letter into my coat pocket to keep.",
  "The workshop is humming, the reindeer keep asking about the weather in Wisconsin, and your letter is up on the wall with the others, right where I can see it.",
];

const CLOSINGS = [
  "Keep being kind, helping out at home and being a good friend. Those are the things I notice most.",
  "Be good to your family, your friends and your teachers. Kindness is what I look for most of all.",
  "Remember to share, to say thank you and to help someone who needs it. That is the best part of Christmas.",
  "Keep doing your best and looking out for other people. I am proud of you for that.",
];

const POSTSCRIPTS = [
  "Mrs. Claus says to leave a little room for cookies.",
  "The reindeer say hello. Dasher says it loudest.",
  "Rudolph wants you to know his nose is working just fine.",
  "The elves took a vote, and your letter is one of their favorites.",
];

// `number` is any whole number that stays the same for a letter (looks.ts's hashOf its id). Each part is
// picked from a different slice of it, so the parts vary independently: 256 replies in all.
export function santaReply(letter: ReplyTo, number: number): { paragraphs: string[]; postscript: string } {
  const n = number >>> 0;
  const from = letter.town ? ` from ${letter.town}` : "";
  // The youngest letters were written with a grown-up's help, and Santa thanks them too.
  const helper = letter.age <= 4 ? " Thank you to the grown-up who helped you write it, too." : "";
  return {
    paragraphs: [
      OPENINGS[n % OPENINGS.length](from) + helper,
      MIDDLES[(n >>> 8) % MIDDLES.length],
      CLOSINGS[(n >>> 16) % CLOSINGS.length],
    ],
    postscript: POSTSCRIPTS[(n >>> 24) % POSTSCRIPTS.length],
  };
}
