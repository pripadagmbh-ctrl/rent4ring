/**
 * What Dale would tell you about each part of the lap, before you drive it.
 *
 * Keyed by the section names in `nordschleife.json`, which come straight from
 * the OSM way names — so the keys are the real signposted names and the list
 * stays in sync with the track data rather than being a second copy of it.
 *
 * One note per section, all 43 of them: a guide with gaps in it sends you into
 * the corners nobody wrote about with less than you had for the others.
 */
export const TRACK_NOTES: Record<string, string> = {
  T13: 'The link back from the Grand Prix circuit. Slow, tight, and worth nothing in itself — everything here is about the exit onto the run down to Hatzenbach.',
  'Sabine-Schmitz-Kurve': 'Named in 2021 for the Queen of the Nürburgring. A quick right that sets you up for the esses; be straight before you commit.',
  Hatzenbogen: 'The sweep in. Carry speed, but leave yourself room — what follows punishes anyone arriving sideways.',
  Hatzenbach: 'Linked esses through the trees. A rhythm section: get the first one right and the rest come to you, get it wrong and you fight all five.',
  Hocheichen: 'Quick left with a blind, downhill exit. The road drops away exactly where you want to look for the apex.',
  'Quiddelbacher Höhe': 'The climb to the crest. Get the car settled and straight here — the next one arrives with the suspension already unloaded.',
  Flugplatz: 'Named for the airfield beside it, and it lives up to it. The crest goes light at speed; be committed before it, not during it.',
  Schwedenkreuz: 'One of the fastest points on the lap. Flat is possible and expensive to get wrong; the barrier is close on the left.',
  Aremberg: 'Heavy braking out of the quickest stretch into a long right that keeps tightening. Brake earlier than feels right.',
  Fuchsröhre: 'The Fox Hole. A flat-out plunge downhill through the trees into a compression that loads the car hard, then straight back uphill. Nothing to see, everything to feel.',
  'Adenauer Forst': 'Slow left, then right, at the top of the climb. The kerbs bite. Most of the time lost here is lost on entry.',
  Metzgesfeld: 'Double left, running downhill. The second part is faster than it looks from the first.',
  Kallenhard: 'Downhill right that tightens all the way through. Patience on the throttle pays for the run that follows.',
  Spiegelkurve: 'Slow left, tight, and easy to overshoot after the downhill run into it.',
  'Dreifach-Rechts': 'Three rights in a row. Treat them as one corner with a long apex and the car stays settled.',
  Wehrseifen: 'Slow, narrow and downhill, with walls close on both sides. The slowest part of the lap and the least forgiving.',
  Breidscheid: 'Over the bridge at the lowest point of the circuit, in the village itself. Bumpy, and the car is light where you least want it.',
  Exmühle: 'Steep uphill right straight out of the bridge. Traction limited — feed the power in, do not throw it in.',
  'Lauda-Links': "Named for Niki Lauda's crash here in 1976. Fast, uphill, blind, and it deserves more respect than its shape suggests.",
  Bergwerk: 'The slow right that opens the long climb. The single most valuable exit on the lap: everything you gain here you carry for the next two kilometres.',
  Senkenlinks: 'A dip in the climb. The car goes light over the crest before it and heavy in the hollow after.',
  Kesselchen: "The Little Kettle: a long, fast, uphill run. Not a corner so much as a place to be smooth and let the engine work.",
  Mutkurve: 'Courage Corner, and named honestly. Uphill, quick, and it rewards commitment rather than caution.',
  Klostertal: 'Braking at the top of the long climb. The road is uneven under the brakes — be straight before you lean on them.',
  Steilstrecke: 'The steep stretch. Short, sharp, and the run-up to the corner everyone comes here for.',
  Karussell: 'The banked concrete bowl. Drop the car in, let the banking hold it, and keep the power on — it is far quicker than it feels and it will rattle your teeth.',
  'Hohe Acht': 'The highest point of the circuit, 617 m above sea level. Blind crest, then it falls away.',
  Hedwigshöhe: 'Fast downhill right off the summit. The car is unloaded on turn-in.',
  Wippermann: 'Quick left-right down the hill. Rhythm again, not bravery.',
  Eschbach: 'Short, downhill and blind. Position the car early; you cannot see where you are going once you have committed.',
  Brünnchen: 'The bank where everyone stands with a camera. Downhill entry into a double right — which is exactly why they stand there.',
  Eiskurve: 'The Ice Corner. Shaded, and it holds damp long after the rest of the lap has dried.',
  Pflanzgarten: 'The jumps. Two of them, both taken close to flat. Land straight or do not land at all.',
  Sprunghügel: 'The jump hill. The car leaves the road and you want it pointing where you will need it when it comes back.',
  'Stefan-Bellof-S': "Named for Stefan Bellof, whose 6:11.13 in 1983 stood for thirty-five years. Quick, kerbed, and unforgiving of greed.",
  Schwalbenschwanz: 'The Swallowtail. Downhill, tightening, and it leads straight into the small banked corner.',
  'Mini-Karussell': 'The little brother of the Karussell — tighter, rougher, and much easier to get wrong.',
  Galgenkopf: 'The last corner that matters. Everything here is exit speed, because what follows is the longest straight on the lap.',
  'Nürburgring Nordschleife': 'The run out onto the straight. Straighten the car, get on the power, and stay there.',
  'Döttinger Höhe': 'Flat out for the best part of a mile, slightly uphill. This is where the power figure on the spec sheet finally means something.',
  Antoniusbuche: 'The kink under the bridge, taken flat. It reads as a corner at speed; it is not one.',
  Tiergarten: 'The fast kink at the end of the straight, and the last thing standing between you and the brakes.',
  Hohenrain: 'The chicane that brings the lap back in. Slow, kerbed, and the easiest place on the circuit to throw away a good lap on the last corner.',
};

export interface TrackFact {
  label: string;
  value: string;
  note: string;
}

/**
 * The numbers on the left come from the track data itself where they can — the
 * length, the section count and the elevation range are measured off the same
 * points the game drives on, so they cannot drift out of step with it.
 */
export const TRACK_FACTS: TrackFact[] = [
  {
    label: 'Opened',
    value: '1927',
    note: 'Built through the Eifel forest around the village of Nürburg and the castle above it.',
  },
  {
    label: 'Highest point',
    value: 'Hohe Acht',
    note: '617 m above sea level. The lowest is down at the bridge in Breidscheid.',
  },
  {
    label: 'Lap record',
    value: '6:11.13',
    note: 'Stefan Bellof, Porsche 956, 1983. It stood for thirty-five years.',
  },
  {
    label: 'The name',
    value: 'Green Hell',
    note: 'Jackie Stewart’s, and nobody has come up with a better one since.',
  },
];
