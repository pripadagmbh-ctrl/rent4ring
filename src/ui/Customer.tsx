interface Props {
  className?: string;
}

/**
 * The customer. A human, unlike the management: narrow, slightly too tall for
 * his own trousers, in the polo and lanyard of a man who booked this months
 * ago and has told everyone at work about it.
 *
 * Drawn in the same idiom as Herr Müller — flat shapes, a couple of gradients,
 * one shadow — so the two read as belonging to the same yard. He is built
 * deliberately gormless: eyebrows up, mouth open, glasses slightly too big.
 * He is about to be carried out by one arm and it should look inevitable.
 */
export default function Customer({ className }: Props) {
  const classes = ['customer', className].filter(Boolean).join(' ');

  return (
    <svg className={classes} viewBox="0 0 150 220" role="img" aria-label="The customer">
      <defs>
        <linearGradient id="c-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8c4a4" />
          <stop offset="100%" stopColor="#cfa484" />
        </linearGradient>
        <linearGradient id="c-polo" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#e2e6ea" />
          <stop offset="55%" stopColor="#c6ccd3" />
          <stop offset="100%" stopColor="#a8b0b8" />
        </linearGradient>
        <linearGradient id="c-shorts" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#6b7280" />
          <stop offset="100%" stopColor="#464d58" />
        </linearGradient>
      </defs>

      <ellipse cx="75" cy="212" rx="40" ry="6" fill="#000" opacity="0.38" />

      {/* Legs: thin, and a good deal of ankle on show. */}
      <path d="M60 150h13l-2 52H58z" fill="url(#c-shorts)" />
      <path d="M77 150h13l2 52H79z" fill="url(#c-shorts)" />
      <path d="M59 186h13v10H59z" fill="url(#c-skin)" />
      <path d="M78 186h13v10H79z" fill="url(#c-skin)" />
      {/* Trainers, box-fresh. */}
      <path d="M53 196h20v9a3 3 0 0 1-3 3H56a3 3 0 0 1-3-3z" fill="#f2f2ee" />
      <path d="M78 196h20v9a3 3 0 0 1-3 3H81a3 3 0 0 1-3-3z" fill="#f2f2ee" />
      <path d="M53 203h20v2H53z" fill="#c8c8c2" />
      <path d="M78 203h20v2H78z" fill="#c8c8c2" />

      {/* Arms, hanging. Narrow enough to be lifted by one of them. */}
      <path d="M40 96c-4 9-5 20-4 30 1 9 3 17 5 23l11-4c-2-6-4-13-5-21-1-9 0-18 3-26z" fill="url(#c-skin)" />
      <path d="M110 96c4 9 5 20 4 30-1 9-3 17-5 23l-11-4c2-6 4-13 5-21 1-9 0-18-3-26z" fill="url(#c-skin)" />

      {/* Torso: a polo that has never been anywhere near a racing car. */}
      <path d="M52 92c0-12 9-20 23-20s23 8 23 20v50c0 6-4 10-10 10H62c-6 0-10-4-10-10z" fill="url(#c-polo)" />
      {/* Placket and collar. */}
      <path d="M73 74h4v22h-4z" fill="#aeb5bc" />
      <path d="M64 72c4 5 8 8 11 8s7-3 11-8l6 4c-5 8-11 12-17 12s-12-4-17-12z" fill="#dfe3e7" />
      {/* Lanyard, because of course. */}
      <path d="M67 80l8 26 8-26 3 2-9 30h-4l-9-30z" fill="#c8151d" />
      <path d="M70 110h10v13H70z" fill="#f2f2ee" />
      <path d="M72 113h6v2h-6z" fill="#9aa0a7" />
      <path d="M72 117h5v2h-5z" fill="#9aa0a7" />

      {/* Neck and head. */}
      <path d="M68 60h14v16H68z" fill="#cfa484" />
      <ellipse cx="75" cy="44" rx="21" ry="23" fill="url(#c-skin)" />
      {/* Ears, one of life's details. */}
      <ellipse cx="54" cy="46" rx="5" ry="7" fill="#cfa484" />
      <ellipse cx="96" cy="46" rx="5" ry="7" fill="#cfa484" />

      {/* Hair: a side parting that has given up. */}
      <path d="M54 36c2-13 10-19 21-19s19 6 21 19c-6-6-13-8-21-8-5 0-9 1-13 3z" fill="#5b4636" />

      {/* Glasses, slightly too big for him. */}
      <g fill="none" stroke="#2b3038" strokeWidth="2.6">
        <circle cx="65" cy="45" r="9.5" fill="#dfeaf2" fillOpacity="0.55" />
        <circle cx="86" cy="45" r="9.5" fill="#dfeaf2" fillOpacity="0.55" />
        <path d="M74.5 45h2" />
        <path d="M55.5 44l-3-2M95.5 44l3-2" />
      </g>
      {/* Eyes behind them, wide open. */}
      <circle cx="65" cy="45" r="3.4" fill="#22262c" />
      <circle cx="86" cy="45" r="3.4" fill="#22262c" />
      <circle cx="66.2" cy="43.8" r="1.1" fill="#fff" opacity="0.9" />
      <circle cx="87.2" cy="43.8" r="1.1" fill="#fff" opacity="0.9" />

      {/* Eyebrows up, mouth open. He has just been told the excess. */}
      <path d="M57 32c4-3 9-3 13-1" stroke="#5b4636" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M80 31c4-2 9-2 13 1" stroke="#5b4636" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="75" cy="60" rx="5" ry="6" fill="#7d3f3f" />
    </svg>
  );
}
