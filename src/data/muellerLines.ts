import type { Gesture, Mood } from '../ui/Gorilla';

/**
 * What Herr Müller says about each car, and how he says it. The garage lines
 * cycle while a car is selected; the farewell is picked once, as the driver
 * heads out of the yard.
 *
 * Tone is his usual en-GB: fond of the cars, fonder still of getting them back
 * in one piece.
 */
export interface MuellerLine {
  text: string;
  mood: Mood;
  gesture?: Gesture;
}

interface CarLines {
  /** Cycled in the garage while this car is on the turntable. */
  garage: MuellerLine[];
  /** One is picked as the car pulls out of the yard. */
  farewell: MuellerLine[];
}

const LINES: Record<string, CarLines> = {
  'mini-cooper-s': {
    garage: [
      {
        text: "Don't let the size fool you — this thing changes direction like it owes you money.",
        mood: 'happy',
        gesture: 'present',
      },
      {
        text: 'Front-wheel drive, so it pushes wide if you are greedy with the throttle. Be patient and it flatters you.',
        mood: 'idle',
        gesture: 'point',
      },
      {
        text: 'Cheapest car on the floor, and half my regulars still cannot beat their own time in it.',
        mood: 'happy',
        gesture: 'thumb',
      },
      {
        text: 'Pink, yes. Slow, no. Ask the gentleman I sent out in the Supra last Tuesday.',
        mood: 'cheer',
      },
    ],
    farewell: [
      {
        text: 'Off you go in the little one. Brake early, turn in late, and it will do the rest.',
        mood: 'happy',
        gesture: 'wave',
      },
      {
        text: 'It is front-wheel drive — lift mid-corner and it tucks in. That is a feature, not a spin.',
        mood: 'happy',
        gesture: 'wave',
      },
      {
        text: 'No excuses in a MINI. Light, honest, and entirely your fault if you are slow. Go on!',
        mood: 'cheer',
        gesture: 'wave',
      },
    ],
  },

  'gr-yaris': {
    garage: [
      {
        text: 'A homologation special with number plates. Toyota built it to go rallying and then had to sell some.',
        mood: 'happy',
        gesture: 'present',
      },
      {
        text: 'Three cylinders, four driven wheels. Sounds like an angry sewing machine, goes like a scalded cat.',
        mood: 'cheer',
      },
      {
        text: 'All-wheel drive lets you be clumsy and get away with it. Do not take that as permission.',
        mood: 'idle',
        gesture: 'point',
      },
      {
        text: 'Damp day? This is the one. It finds grip while the Porsches are still spinning their wheels.',
        mood: 'happy',
        gesture: 'thumb',
      },
    ],
    farewell: [
      {
        text: 'Take the rally car out and use the traction. Point it, plant it, let the diffs sort it out.',
        mood: 'cheer',
        gesture: 'wave',
      },
      {
        text: 'It will not win on the Döttinger Höhe. It will win absolutely everywhere else. Off with you!',
        mood: 'happy',
        gesture: 'wave',
      },
      {
        text: 'Drive it like it is gravel and you will surprise yourself. The Armco is not a snowbank, mind.',
        mood: 'happy',
        gesture: 'wave',
      },
    ],
  },

  'gr-supra': {
    garage: [
      {
        text: 'Straight-six, rear-wheel drive, short wheelbase. Everything your instructor warned you about.',
        mood: 'happy',
        gesture: 'present',
      },
      {
        text: 'Three hundred and forty horsepower, all of it to the back wheels. The throttle is a dial, not a switch.',
        mood: 'idle',
        gesture: 'point',
      },
      {
        text: 'Short in the wheelbase — which is the polite way of saying it will swap ends if you insult it.',
        mood: 'scared',
      },
      {
        text: 'The six pulls all the way to the top. You will hear it long before you look at the rev counter.',
        mood: 'cheer',
      },
    ],
    farewell: [
      {
        text: 'Rear drive, short wheelbase. Squeeze the throttle on the way out — do not stamp on it.',
        mood: 'idle',
        gesture: 'wave',
      },
      {
        text: 'Enjoy the six. Just remember which end is doing the driving when you reach Pflanzgarten.',
        mood: 'happy',
        gesture: 'wave',
      },
      {
        text: 'If it comes round on you, look where you want to go. The barrier is not going anywhere.',
        mood: 'scared',
        gesture: 'wave',
      },
    ],
  },

  'taycan-turbo-gt': {
    garage: [
      {
        text: 'One thousand and thirty-four horsepower and not a drop of petrol. The future is quite rude, isn’t it.',
        mood: 'cheer',
        gesture: 'present',
      },
      {
        text: 'Two and a bit tonnes of it, mind. It accelerates like nothing else, then asks you politely to stop.',
        mood: 'idle',
        gesture: 'point',
      },
      {
        text: 'No gears, no drama, no noise. Just a shove in the back that simply does not let up.',
        mood: 'happy',
      },
      {
        text: 'Batteries in the floor, so it corners far flatter than two-point-three tonnes has any right to.',
        mood: 'happy',
        gesture: 'thumb',
      },
    ],
    farewell: [
      {
        text: 'All the torque, all at once, from a standstill. Brake earlier than feels right — it weighs what it weighs.',
        mood: 'idle',
        gesture: 'wave',
      },
      {
        text: 'Silence is not slowness. You will see numbers on the Döttinger Höhe you will not believe.',
        mood: 'cheer',
        gesture: 'wave',
      },
      {
        text: 'It out-drags everything here off the line. Getting it stopped again is the interesting part!',
        mood: 'happy',
        gesture: 'wave',
      },
    ],
  },

  '718-spyder-rs': {
    garage: [
      {
        text: 'Nine thousand revs of naturally aspirated flat-six, right behind your head. Turn the sound on.',
        mood: 'cheer',
        gesture: 'present',
      },
      {
        text: 'Mid-engined, roof off, five hundred horsepower. There is no better way to see the Eifel.',
        mood: 'happy',
      },
      {
        text: 'That is the GT3 engine in a smaller, lighter car. Porsche briefly lost their minds and we all benefited.',
        mood: 'cheer',
        gesture: 'thumb',
      },
      {
        text: 'Balanced like nothing else on this floor. Engine in the middle, so it turns as if it is on rails.',
        mood: 'happy',
        gesture: 'point',
      },
    ],
    farewell: [
      {
        text: 'Take it to nine thousand at least once. That is not advice, that is a condition of the rental.',
        mood: 'cheer',
        gesture: 'wave',
      },
      {
        text: 'Mid-engined, so it rotates beautifully — right up until it does not. Respect it and it is sublime.',
        mood: 'idle',
        gesture: 'wave',
      },
      {
        text: 'Roof off, flat-six behind you, Karussell waiting. Off you go — and mind my paintwork!',
        mood: 'happy',
        gesture: 'wave',
      },
    ],
  },

  '911-gt3-rs': {
    garage: [
      {
        text: 'Eight hundred and sixty kilos of downforce at two eighty-five. The faster you go, the more it grips.',
        mood: 'cheer',
        gesture: 'present',
      },
      {
        text: 'This is the benchmark. Every time I hand these particular keys over I age about a year.',
        mood: 'scared',
      },
      {
        text: 'That wing is not for show. Trust it through the fast stuff and it will astonish you.',
        mood: 'happy',
        gesture: 'point',
      },
      {
        text: 'Engine behind the rear axle, as Ferdinand intended. It works. Do not ask me how.',
        mood: 'happy',
        gesture: 'thumb',
      },
    ],
    farewell: [
      {
        text: 'The wing only works if you are quick. Be brave through Kesselchen and it sticks like glue.',
        mood: 'cheer',
        gesture: 'wave',
      },
      {
        text: 'My favourite car and my largest insurance premium. Please bring both of us back in one piece.',
        mood: 'scared',
        gesture: 'wave',
      },
      {
        text: 'Rear-engined, five hundred and twenty-five horses. On the throttle after the apex — not before.',
        mood: 'idle',
        gesture: 'wave',
      },
    ],
  },

  'ferrari-296-gtb': {
    garage: [
      {
        text: 'Eight hundred and thirty horsepower from a hybrid V6. Maranello have been busy.',
        mood: 'cheer',
        gesture: 'present',
      },
      {
        text: 'A V6 in a Ferrari. I was sceptical too. Then I drove it, and then I stopped talking.',
        mood: 'happy',
      },
      {
        text: 'The electric motor fills in whatever the turbos cannot. There is no hole in the delivery anywhere.',
        mood: 'happy',
        gesture: 'point',
      },
      {
        text: 'The most powerful thing on this floor — and the most expensive door mirror in the building.',
        mood: 'scared',
      },
    ],
    farewell: [
      {
        text: 'Eight hundred and thirty horsepower and rear-wheel drive. The maths is not on your side — be smooth.',
        mood: 'idle',
        gesture: 'wave',
      },
      {
        text: 'Keep it tidy out there. Every panel on that car costs more than my own car.',
        mood: 'scared',
        gesture: 'wave',
      },
      {
        text: 'It flatters you everywhere but the exit of a slow corner. That is where it checks you were listening.',
        mood: 'happy',
        gesture: 'wave',
      },
    ],
  },
  // His own bike, and the only thing in the yard he rides himself. So he is
  // not selling it to you — he is talking himself into it, and the customer
  // he lectures is the one in the mirror.
  'ducati-panigale-v4': {
    garage: [
      {
        text: 'Ah. No. This one is not for hire. This one is mine, and I am taking it out myself. You may watch.',
        mood: 'cheer',
        gesture: 'present',
      },
      {
        text: 'Two hundred and sixteen horsepower against a hundred and ninety-five kilos. I have done the sum. I keep doing the sum.',
        mood: 'happy',
        gesture: 'point',
      },
      {
        text: 'My wife asks why I need it. I tell her it is inventory. It has been inventory for four years.',
        mood: 'idle',
      },
      {
        text: 'Helmet, gloves, back protector. I lecture everyone about this and then I am the one who forgets the earplugs.',
        mood: 'idle',
        gesture: 'point',
      },
      {
        text: 'No roof, no cage, no wing to hide behind. Just me and a great deal of poor judgement.',
        mood: 'happy',
        gesture: 'thumb',
      },
      {
        text: 'The dog knows that sound. Look at him. He knows exactly what I am about to do.',
        mood: 'cheer',
      },
    ],
    farewell: [
      {
        text: 'Right, Müller. Gently out of the yard, warm the tyres, and no heroics before Hatzenbach. …He never listens.',
        mood: 'happy',
        gesture: 'wave',
      },
      {
        text: 'Twenty-six years telling people to take it easy. Watch me ignore every word of it.',
        mood: 'cheer',
        gesture: 'wave',
      },
      {
        text: 'If I bin it, I have nobody to shout at. That is the one flaw in the arrangement.',
        mood: 'happy',
        gesture: 'wave',
      },
    ],
  },
};

/** Used if a car ever turns up without its own script. */
const FALLBACK: CarLines = {
  garage: [
    { text: 'Lovely thing, this. Take it round and see what it gives you.', mood: 'happy', gesture: 'present' },
    { text: 'Beat the target time and there is ten percent off your next booking in it.', mood: 'happy', gesture: 'point' },
  ],
  farewell: [
    { text: 'Off you go then — and mind the Armco, it is solid steel.', mood: 'happy', gesture: 'wave' },
  ],
};

function linesFor(carId: string): CarLines {
  return LINES[carId] ?? FALLBACK;
}

/** The full rotation of garage lines for a car. */
export function garageLines(carId: string): MuellerLine[] {
  return linesFor(carId).garage;
}

/**
 * A send-off for this car. `avoid` keeps consecutive departures in the same car
 * from repeating the same line.
 */
export function farewellLine(carId: string, avoid?: string): MuellerLine {
  const options = linesFor(carId).farewell;
  const fresh = options.filter((l) => l.text !== avoid);
  const pool = fresh.length > 0 ? fresh : options;
  return pool[Math.floor(Math.random() * pool.length)];
}
