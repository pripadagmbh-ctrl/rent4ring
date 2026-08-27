/**
 * Dale's calls from the passenger seat.
 *
 * He is British, he has more laps of this place than anyone else in the yard,
 * and he instructs the way the good ones do: one thing at a time, said early
 * enough to act on, and never a word about what you have already got wrong.
 *
 * Keyed to the section names in nordschleife.json. The game looks the coming
 * section up as you approach it, so a call always lands before the corner
 * rather than in the middle of it.
 */
export type TipKind = 'line' | 'brake' | 'warn';

export interface DaleTip {
  text: string;
  kind: TipKind;
}

const TIPS: Record<string, DaleTip[]> = {
  Hatzenbach: [
    { text: 'Hatzenbach next. In slow, out tidy — the second one is tighter than it looks and it sets up the whole sequence.', kind: 'line' },
    { text: 'Small hands through here. Anyone who attacks Hatzenbach is fixing it for the next four corners.', kind: 'line' },
  ],
  Hocheichen: [
    { text: 'Hocheichen. It goes uphill and away from you — hold the wheel still and let it drift out to the kerb.', kind: 'line' },
  ],
  'Quiddelbacher Höhe': [
    { text: 'Over the brow now, then Flugplatz. Have it straight before the crest, not after.', kind: 'warn' },
  ],
  Flugplatz: [
    { text: 'Flugplatz. She goes light over the top — feed the steering in early and be patient while she lands.', kind: 'warn' },
    { text: 'Do not lift over the crest. Lifting here is how people find the barrier on the left.', kind: 'warn' },
  ],
  Schwedenkreuz: [
    { text: 'Schwedenkreuz. Quick left, and it is all commitment — a brave lift, then back on it. Barrier is close on the exit.', kind: 'warn' },
  ],
  Aremberg: [
    { text: 'Aremberg. Brake in a straight line before it drops, then one smooth arc. It tightens on the way in.', kind: 'brake' },
  ],
  Fuchsröhre: [
    { text: 'Fox Hole. Downhill, then it compresses hard at the bottom — keep it straight through the dip or she will bottom out and step sideways.', kind: 'warn' },
    { text: 'This is the best corner on earth and the least forgiving. Eyes up, hands quiet.', kind: 'line' },
  ],
  'Adenauer Forst': [
    { text: 'Adenauer Forst. Heavy braking from a long way out — left, right, and do not touch the inside kerbs.', kind: 'brake' },
  ],
  Metzgesfeld: [
    { text: 'Metzgesfeld. Long left that keeps going. One turn of the wheel and leave it there.', kind: 'line' },
  ],
  Kallenhard: [
    { text: 'Kallenhard. Downhill right, off camber on the exit. Get the braking done early and be gentle with the throttle.', kind: 'brake' },
  ],
  Wehrseifen: [
    { text: 'Wehrseifen. Very slow, downhill into it — third gear, and let the front settle before you turn.', kind: 'brake' },
  ],
  Breidscheid: [
    { text: 'Bridge at Breidscheid, then it climbs. Straighten it over the bridge and use all the road on the way out.', kind: 'line' },
  ],
  Bergwerk: [
    { text: 'Bergwerk. This one has caught better drivers than both of us — slow in, wait, and only then the throttle.', kind: 'warn' },
    { text: 'Patience at Bergwerk. Everything after it is flat out, so a tidy exit is worth half a minute.', kind: 'line' },
  ],
  Kesselchen: [
    { text: 'Kesselchen. Uphill and fast — carry the speed, do not lift for the kinks.', kind: 'line' },
  ],
  Klostertal: [
    { text: 'Klostertal. Big stop from a long way out, then a short right and back uphill.', kind: 'brake' },
  ],
  Steilstrecke: [
    { text: 'Steilstrecke, and the Karussell right after it. Get left, and look for the drop.', kind: 'line' },
  ],
  Karussell: [
    { text: 'Karussell. Aim at the church spire, drop the right-hand wheels into the concrete and let it carry you round.', kind: 'line' },
    { text: 'Into the banking, hold it there, and do not try to steer out early — it lets go on its own terms.', kind: 'warn' },
  ],
  'Hohe Acht': [
    { text: 'Hohe Acht. Highest point on the lap, tight and uphill — short shift and let it pull you round.', kind: 'line' },
  ],
  Wippermann: [
    { text: 'Wippermann. Blind, and it drops away — trust the line, not your eyes.', kind: 'warn' },
  ],
  Brünnchen: [
    { text: 'Brünnchen. Two rights, and the second one is where everyone puts it in the wall. Slow the second.', kind: 'warn' },
    { text: 'The crowd stands here for a reason. Do not give them what they came for.', kind: 'warn' },
  ],
  Eiskurve: [
    { text: 'Eiskurve. Off camber, so it will push wide — one turn of lock and be patient.', kind: 'warn' },
  ],
  Pflanzgarten: [
    { text: 'Pflanzgarten. She gets airborne — have her straight before the jump and be off the brakes when she lands.', kind: 'warn' },
    { text: 'Two jumps, then it turns. Land first, steer second. Never both.', kind: 'warn' },
  ],
  'Stefan-Bellof-S': [
    { text: 'Bellof S. Quick left-right, kerbs are usable — but only the flat ones.', kind: 'line' },
  ],
  Schwalbenschwanz: [
    { text: 'Schwalbenschwanz. Tight, then the small Karussell — same trick as the big one, drop it in.', kind: 'line' },
  ],
  Galgenkopf: [
    { text: 'Galgenkopf. This is the one that matters — a clean exit buys you the whole straight.', kind: 'line' },
  ],
  'Döttinger Höhe': [
    { text: 'Straight now. Everything you have, all the way to the far end.', kind: 'line' },
  ],
  Antoniusbuche: [
    { text: 'Still flat. It kinks under the bridge, that is all it does.', kind: 'line' },
  ],
  Tiergarten: [
    { text: 'Tiergarten, then the chicane. Brake later than feels sensible, but brake in a straight line.', kind: 'brake' },
  ],
  Hohenrain: [
    { text: 'Hohenrain chicane. Kerbs on both sides, and the lap ends just after — no heroics now.', kind: 'brake' },
  ],
};

/** A call for this section, or nothing if he has nothing useful to add. */
export function tipFor(section: string, index = 0): DaleTip | null {
  const list = TIPS[section];
  if (!list || list.length === 0) return null;
  return list[index % list.length];
}

/**
 * What he says to Herr Müller — not to you — when the customer has just done
 * something expensive. He is a guest in these cars too.
 */
export const DALE_APOLOGIES = [
  'Sorry, Müller. That one was on me — I called it too late.',
  'My fault, that. I should have had him braking earlier.',
  'Apologies, old friend. I will get him settled down.',
  'That was not the line I gave him, for the record.',
  'I know, I know. Put the wing on my tab, not his.',
  'Right. Deep breath, and we go again. Sorry, Müller.',
  'He is listening now. He was not before, but he is now.',
];

/** Things he says in the garage, before you ever turn a wheel. */
export const DALE_GARAGE = [
  'Dale. I sit on the left and I talk. You drive and you listen — that is the whole arrangement.',
  'Twenty point eight kilometres. Nobody learns it in one go, so we will take it in pieces.',
  'I have been round here more times than I have had hot dinners, and it still surprises me twice a lap.',
  'The trick is not going fast. The trick is not going slow in the wrong places.',
  'Müller and I have an understanding: I bring the cars back, he keeps the coffee coming.',
  'If I say lift, lift. We can discuss why afterwards, over that coffee.',
];
