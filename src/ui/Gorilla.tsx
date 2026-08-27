export type Mood = 'idle' | 'happy' | 'angry' | 'scared' | 'cheer' | 'trophy';

/**
 * What his arms are doing. Independent of `mood`, which drives the face — he can
 * wave goodbye while looking worried, which is most of his working day.
 */
export type Gesture = 'none' | 'wave' | 'point' | 'thumb' | 'present';

interface Props {
  mood: Mood;
  /** Show the trophy in his raised hand. */
  trophy?: boolean;
  /** Arm pose; overrides whatever the mood was doing with them. */
  gesture?: Gesture;
  /** Animates the jaw, for while a line of his is being shown. */
  talking?: boolean;
  className?: string;
}

/**
 * Herr Müller, the Rent4Ring mascot: a gym-built silverback with a mop of dark
 * wavy hair, permanent stubble, shades and a full sleeve of ink, wearing a navy
 * tee that gave up on his shoulders some time ago.
 *
 * The shades ride up onto his forehead whenever he loses his composure, so you
 * can actually see what he makes of your driving.
 */
export default function Gorilla({
  mood,
  trophy = false,
  gesture = 'none',
  talking = false,
  className,
}: Props) {
  const classes = [
    'gorilla',
    `gorilla--${mood}`,
    gesture !== 'none' && `gorilla--g-${gesture}`,
    talking && 'gorilla--talking',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className={classes}
      viewBox="0 0 260 220"
      role="img"
      aria-label={`Herr Müller looks ${MOOD_LABEL[mood]}`}
    >
      <defs>
        <linearGradient id="g-fur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9c9289" />
          <stop offset="55%" stopColor="#7d7268" />
          <stop offset="100%" stopColor="#635a52" />
        </linearGradient>
        <linearGradient id="g-arm" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#a89d93" />
          <stop offset="55%" stopColor="#8b8177" />
          <stop offset="100%" stopColor="#6d645b" />
        </linearGradient>
        <linearGradient id="g-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c2a893" />
          <stop offset="100%" stopColor="#9c8270" />
        </linearGradient>
        <linearGradient id="g-hair" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#54402f" />
          <stop offset="60%" stopColor="#34261b" />
          <stop offset="100%" stopColor="#221810" />
        </linearGradient>
        <linearGradient id="g-shirt" x1="0.15" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="#4a6494" />
          <stop offset="45%" stopColor="#33496f" />
          <stop offset="100%" stopColor="#22314c" />
        </linearGradient>
        <linearGradient id="g-jeans" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#3b4557" />
          <stop offset="100%" stopColor="#232a37" />
        </linearGradient>
        <linearGradient id="g-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe89a" />
          <stop offset="42%" stopColor="#f5c542" />
          <stop offset="100%" stopColor="#c08a12" />
        </linearGradient>
        <radialGradient id="g-glow" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#f5c542" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f5c542" stopOpacity="0" />
        </radialGradient>
        {/* The ink only shows on the forearm it is painted on. */}
        <clipPath id="g-sleeve-clip">
          <path d="M58 140c0-16 6-27 16-33l16 6c-6 8-9 18-8 29 1 12 4 21 7 27l-18 8c-8-10-13-24-13-37z" />
        </clipPath>
      </defs>

      <ellipse cx="130" cy="211" rx="72" ry="8" fill="#000" opacity="0.4" />

      <g className="gorilla__body">
        {/* ---------------------------------------------------------- jeans */}
        <path d="M96 206c-11 0-17-6-15-15l6-38h32l4 38c1 9-6 15-17 15z" fill="url(#g-jeans)" />
        <path d="M164 206c11 0 17-6 15-15l-6-38h-32l-4 38c-1 9 6 15 17 15z" fill="url(#g-jeans)" />
        <path d="M100 158h30v3h-30z" fill="#1c2230" opacity="0.5" />
        <path d="M130 158h30v3h-30z" fill="#1c2230" opacity="0.5" />
        {/* Trainers */}
        <path d="M80 206h34v8a4 4 0 0 1-4 4H84a4 4 0 0 1-4-4z" fill="#f0f0ee" />
        <path d="M146 206h34v8a4 4 0 0 1-4 4h-26a4 4 0 0 1-4-4z" fill="#f0f0ee" />
        <path d="M80 213h34v2H80z" fill="#c9c9c4" />
        <path d="M146 213h34v2h-34z" fill="#c9c9c4" />

        {/* The deltoids stay welded to the torso; only what hangs below the
            shoulder joint is allowed to swing. */}
        <path d="M63 96c6-8 16-12 26-11l-2 22c-9-1-17 2-22 8z" fill="#a89d93" />
        <path d="M197 96c-6-8-16-12-26-11l2 22c9-1 17 2 22 8z" fill="#a89d93" />

        {/* ------------- left arm: one continuous limb, biceps to knuckles */}
        <g transform="translate(-11 0)">
          <g className="gorilla__arm-left">
          <path
            d="M72 96c-10 10-14 18-12 26 1 10-1 16 0 24 1 10 0 16 2 24 1 10 2 16 6 20 6 4 20 3 24-2 2-8-4-12-6-20
               -2-10-2-16-4-22-1-12 0-18 2-26 2-10 6-18 12-24z"
            fill="url(#g-arm)"
          />
          {/* Muscle definition, drawn as shading rather than separate lumps */}
          <path d="M74 104c-6 8-9 16-8 24 3-9 7-17 12-23z" fill="#b5aaa0" opacity="0.55" />
          <path d="M62 144c6 3 14 3 20 0-6 5-14 5-20 0z" fill="#6d645b" opacity="0.5" />
          <path d="M66 120c5 3 12 3 17 0-5 4-12 4-17 0z" fill="#6d645b" opacity="0.35" />

          {/* Tattoo sleeve, clipped to the forearm */}
          <g clipPath="url(#g-sleeve-clip)" opacity="0.55">
            <circle cx="72" cy="156" r="8" fill="none" stroke="#141b2b" strokeWidth="2.6" />
            <path d="M62 168c8-5 16-5 22 0" fill="none" stroke="#141b2b" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M64 176c7-4 14-4 20 0" fill="none" stroke="#141b2b" strokeWidth="2" strokeLinecap="round" />
            <path d="M68 149l5-7 5 7-5 4z" fill="#141b2b" />
            <path d="M62 182c8 3 18 3 24 0" fill="none" stroke="#141b2b" strokeWidth="2.2" strokeLinecap="round" />
          </g>

          {/* Fist, blended into the forearm rather than stuck on it */}
          <path d="M70 180c8-2 18-1 22 3 3 5 1 11-4 13-7 3-16 2-20-3-3-5-2-11 2-13z" fill="#7d7268" />
          <path d="M74 188c6-1 12-1 16 1" fill="none" stroke="#5f574f" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </g>

        {/* ------------- right arm: raises the trophy, or hides his face */}
        <g transform="translate(11 0)">
          <g className="gorilla__arm-right">
          <path
            d="M188 96c10 10 14 18 12 26-1 10 1 16 0 24-1 10 0 16-2 24-1 10-2 16-6 20-6 4-20 3-24-2-2-8 4-12 6-20
               2-10 2-16 4-22 1-12 0-18-2-26-2-10-6-18-12-24z"
            fill="url(#g-arm)"
          />
          <path d="M186 104c6 8 9 16 8 24-3-9-7-17-12-23z" fill="#b5aaa0" opacity="0.55" />
          <path d="M198 144c-6 3-14 3-20 0 6 5 14 5 20 0z" fill="#6d645b" opacity="0.5" />
          <path d="M194 120c-5 3-12 3-17 0 5 4 12 4 17 0z" fill="#6d645b" opacity="0.35" />
          <path d="M190 180c-8-2-18-1-22 3-3 5-1 11 4 13 7 3 16 2 20-3 3-5 2-11-2-13z" fill="#7d7268" />

          {trophy && (
            <g transform="translate(194 44)" className="gorilla__trophy">
              <circle cx="0" cy="20" r="42" fill="url(#g-glow)" className="trophy-shine" />
              <rect x="-13" y="46" width="26" height="7" rx="2.5" fill="url(#g-gold)" />
              <rect x="-9" y="38" width="18" height="9" rx="2" fill="#d4a02a" />
              <rect x="-3.5" y="26" width="7" height="14" fill="url(#g-gold)" />
              <path d="M-15 0h30l-3 18c-1 6-6 10-12 10s-11-4-12-10z" fill="url(#g-gold)" />
              <rect x="-16" y="-4" width="32" height="6" rx="2.5" fill="#ffe89a" />
              <path d="M-15 2c-8 0-12 5-12 10s4 9 10 9" fill="none" stroke="url(#g-gold)" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M15 2c8 0 12 5 12 10s-4 9-10 9" fill="none" stroke="url(#g-gold)" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M-24-10l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" className="trophy-shine" />
            </g>
          )}
          </g>
        </g>


        {/* -------------------------- torso: navy tee, straining at the seams */}
        <path
          d="M130 58c24 0 41 10 51 28 6 11 8 25 7 38-1 17-5 28-11 34-9 8-27 12-47 12s-38-4-47-12c-6-6-10-17-11-34-1-13 1-27 7-38 10-18 27-28 51-28z"
          fill="url(#g-shirt)"
        />
        {/* Collar */}
        <path d="M108 62c8 9 36 9 44 0l3 8c-11 9-39 9-50 0z" fill="#22314c" />
        <path d="M110 64c8 7 32 7 40 0l1 3c-10 7-32 7-42 0z" fill="#5a76a8" opacity="0.55" />
        {/* Sleeve hems, cut short around the arms */}
        <path d="M79 94c5-13 15-23 28-27l4 15c-9 3-16 10-20 19z" fill="#2b3d5e" />
        <path d="M181 94c-5-13-15-23-28-27l-4 15c9 3 16 10 20 19z" fill="#2b3d5e" />
        {/* Chest and fabric folds */}
        <path d="M112 96c6 8 30 8 36 0" fill="none" stroke="#22314c" strokeWidth="2.2" opacity="0.6" />
        <path d="M104 120c14 7 38 7 52 0" fill="none" stroke="#22314c" strokeWidth="2" opacity="0.45" />
        <path d="M100 142c18 8 42 8 60 0" fill="none" stroke="#22314c" strokeWidth="2" opacity="0.35" />
        {/* Rent4Ring across the chest, curving with the fabric */}
        <g className="gorilla__chest-logo" transform="translate(130 108) scale(0.30)">
          <g transform="translate(-140 -48)">
            <g transform="skewX(-12)">
              <rect x="12" y="18" width="112" height="30" rx="6" fill="#e5142b" />
              <text
                x="60"
                y="39.5"
                textAnchor="middle"
                fill="#fff"
                fontFamily="Barlow Condensed, Arial Narrow, sans-serif"
                fontWeight="700"
                fontSize="25"
                letterSpacing="2"
              >
                RENT
              </text>
            </g>
            <g transform="skewX(-12)">
              <rect x="146" y="50" width="118" height="30" rx="6" fill="#e5142b" />
              <text
                x="208"
                y="71.5"
                textAnchor="middle"
                fill="#fff"
                fontFamily="Barlow Condensed, Arial Narrow, sans-serif"
                fontWeight="700"
                fontSize="25"
                letterSpacing="2"
              >
                RING
              </text>
            </g>
            <g transform="translate(106 3) skewX(-12)">
              <path
                d="M34 0 L52 0 L52 46 L62 46 L62 62 L52 62 L52 82 L32 82 L32 62 L-6 62 L-6 44 Z
                   M32 46 L32 22 L14 46 Z"
                fill="#e5142b"
                stroke="#e5142b"
                strokeWidth="11"
                strokeLinejoin="round"
              />
              <path
                d="M34 0 L52 0 L52 46 L62 46 L62 62 L52 62 L52 82 L32 82 L32 62 L-6 62 L-6 44 Z
                   M32 46 L32 22 L14 46 Z"
                fill="#fff"
                fillRule="evenodd"
              />
            </g>
          </g>
        </g>

        {/* ---------------------------------------------- traps, neck and head */}
        <path d="M102 66c8-12 50-12 58 0-8 7-50 7-58 0z" fill="#6d645b" />
        <path d="M114 54h32v16h-32z" fill="#8b8177" />

        <g className="gorilla__head">
          <ellipse cx="130" cy="40" rx="39" ry="34" fill="url(#g-fur)" />
          <ellipse cx="92" cy="42" rx="7" ry="9" fill="#8b8177" />
          <ellipse cx="168" cy="42" rx="7" ry="9" fill="#8b8177" />

          {/* Curls escaping under the cap, and the sideburns */}
          <path d="M96 30c4-8 12-13 21-15-5 5-8 10-9 16z" fill="url(#g-hair)" />
          <path d="M164 30c-4-8-12-13-21-15 5 5 8 10 9 16z" fill="url(#g-hair)" />
          <path d="M97 34c3 6 4 13 3 19-4-5-6-12-5-19z" fill="url(#g-hair)" />
          <path d="M163 34c-3 6-4 13-3 19 4-5 6-12 5-19z" fill="url(#g-hair)" />

          {/* Navy cap, worn backwards */}
          <path d="M95 26C95 8 110-2 130-2s35 10 35 28c0 3-2 5-5 5H100c-3 0-5-2-5-5z" fill="#26365a" />
          <path d="M100 12c8-8 20-12 30-12-12 3-22 9-27 17z" fill="#31456f" opacity="0.8" />
          {/* Peak pointing backwards: a sliver showing past the right side */}
          <path d="M164 22c8-2 15-1 19 2 2 2 1 5-2 5h-17z" fill="#1d2a48" />
          {/* Strap gap at the back */}
          <path d="M160 24h6v5h-6z" fill="#141d33" />
          {/* Cap button */}
          <circle cx="130" cy="0" r="2.4" fill="#31456f" />

          <ellipse cx="130" cy="49" rx="28" ry="23" fill="url(#g-face)" />

          {/* Stubble across the jaw and upper lip */}
          <path
            d="M104 56c2 12 12 20 26 20s24-8 26-20c2 10-2 19-9 24-5 4-11 6-17 6s-12-2-17-6c-7-5-11-14-9-24z"
            fill="#3a2c22"
            opacity="0.32"
          />

          {/* Barely-there brows, like the real Herr Müller — the ridge of the
              brow bone does the acting instead */}
          <path
            className="gorilla__brow-l"
            d="M107 39c7-2 15-3 21-2 2 0 2 3 0 3-7-1-14 0-19 2-2 1-4-2-2-3z"
            fill="#4a3a2c"
            opacity="0.55"
          />
          <path
            className="gorilla__brow-r"
            d="M153 39c-7-2-15-3-21-2-2 0-2 3 0 3 7-1 14 0 19 2 2 1 4-2 2-3z"
            fill="#4a3a2c"
            opacity="0.55"
          />

          <g className="gorilla__eyes">
            <ellipse cx="118" cy="45" rx="5.6" ry="6.2" fill="#fff" />
            <ellipse cx="142" cy="45" rx="5.6" ry="6.2" fill="#fff" />
            <circle className="gorilla__pupil" cx="119" cy="46" r="3.4" fill="#33210f" />
            <circle className="gorilla__pupil" cx="143" cy="46" r="3.4" fill="#33210f" />
            <circle cx="120.4" cy="44.4" r="1.2" fill="#fff" />
            <circle cx="144.4" cy="44.4" r="1.2" fill="#fff" />
          </g>

          {/* Shades — worn low when he is calm, shoved up when he is not */}
          <g className="gorilla__shades">
            <path d="M104 42h52v3h-52z" fill="#15151a" />
            <path d="M106 42h20a3 3 0 0 1 3 3v4a9 9 0 0 1-9 8h-8a9 9 0 0 1-9-8v-4a3 3 0 0 1 3-3z" fill="#1c2a35" />
            <path d="M134 42h20a3 3 0 0 1 3 3v4a9 9 0 0 1-9 8h-8a9 9 0 0 1-9-8v-4a3 3 0 0 1 3-3z" fill="#1c2a35" />
            <path d="M108 44h16l-3 5h-14z" fill="#7fb0cc" opacity="0.55" />
            <path d="M136 44h16l-3 5h-14z" fill="#7fb0cc" opacity="0.55" />
            <path d="M126 45h8v2h-8z" fill="#15151a" />
          </g>

          {/* Muzzle */}
          <ellipse cx="130" cy="60" rx="17" ry="12" fill="#b09079" />
          <ellipse cx="124" cy="57" rx="2.7" ry="3.3" fill="#3a2820" />
          <ellipse cx="136" cy="57" rx="2.7" ry="3.3" fill="#3a2820" />

          {/* Mouths — CSS shows exactly one per mood */}
          <g className="mouth mouth--grin">
            <path d="M117 64c6 8 20 8 26 0z" fill="#3a2820" />
            <path d="M118.5 65h23v3.4h-23z" fill="#f8f5ee" />
          </g>
          <path className="mouth mouth--flat" d="M119 65h22" fill="none" stroke="#3a2820" strokeWidth="2.7" strokeLinecap="round" />
          <g className="mouth mouth--roar">
            <ellipse cx="130" cy="66" rx="13" ry="8.5" fill="#3a2820" />
            <path d="M119 62h22v3.6h-22z" fill="#f8f5ee" />
            <path d="M121 69.6l3-3 3 3 3-3 3 3 3-3 3 3z" fill="#f8f5ee" />
          </g>
          <g className="mouth mouth--bite">
            <ellipse cx="130" cy="67" rx="8.5" ry="5.5" fill="#3a2820" />
            <path d="M122 64h17v3h-17z" fill="#f8f5ee" />
          </g>

          <path className="gorilla__sweat" d="M165 28c0 0 5 7 5 10a5 5 0 0 1-10 0c0-3 5-10 5-10z" fill="#9fd4f5" />
        </g>
      </g>
    </svg>
  );
}

const MOOD_LABEL: Record<Mood, string> = {
  idle: 'relaxed',
  happy: 'pleased',
  angry: 'furious',
  scared: 'terrified',
  cheer: 'delighted',
  trophy: 'proud',
};
