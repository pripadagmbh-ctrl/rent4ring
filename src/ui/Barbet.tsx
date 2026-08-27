interface Props {
  className?: string;
}

/**
 * Herr Müller's barbet, sitting at his heel on the showroom floor.
 *
 * A barbet is a French water dog: dense woolly curls all over, a proper beard
 * and moustache, long drop ears under the same curls. Drawn grey over black so
 * he reads against the dark garage without competing with the car, with the
 * curls suggested by a scalloped outline plus a scatter of lighter tufts —
 * a smooth silhouette would just be a labrador.
 */
export default function Barbet({ className }: Props) {
  const classes = ['barbet', className].filter(Boolean).join(' ');

  return (
    <svg className={classes} viewBox="0 0 180 200" role="img" aria-label="Herr Müller's barbet">
      <defs>
        <linearGradient id="b-coat" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#6e7276" />
          <stop offset="45%" stopColor="#4a4e52" />
          <stop offset="100%" stopColor="#26292c" />
        </linearGradient>
        <linearGradient id="b-coat-dark" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#4c5054" />
          <stop offset="100%" stopColor="#1c1f22" />
        </linearGradient>
        <linearGradient id="b-muzzle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a8e92" />
          <stop offset="100%" stopColor="#5c6064" />
        </linearGradient>
      </defs>

      <ellipse cx="92" cy="192" rx="54" ry="7" fill="#000" opacity="0.4" />

      {/* Tail, behind everything. Drawn as a tapering stroke rather than a
          filled wedge — as a polygon it read as a fin stuck to his side. */}
      <g className="barbet__tail">
        <path
          d="M126 156c14 3 25-4 31-17"
          stroke="url(#b-coat-dark)"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="158" cy="137" r="7.5" fill="#4c5054" />
      </g>

      {/* Haunch and rump — he is sitting, so the back end is a broad wedge. */}
      <path
        d="M104 186c-6 0-9-4-8-9 2-14 3-26 8-38 6-14 17-22 30-22 14 0 22 11 21 27
           -1 20-8 34-19 41-8 5-19 1-32 1z"
        fill="url(#b-coat-dark)"
      />
      {/* Scalloped rump edge: the curls, not a smooth back. */}
      <path
        d="M137 118c5-4 11-3 13 2 3-5 9-5 12 0 3-5 8-3 9 3 1 7-1 15-4 22-2-6-6-9-10-8
           -1-6-6-9-11-6-2-6-6-9-11-7z"
        fill="#5a5e62"
        opacity="0.55"
      />

      {/* Chest and front legs. */}
      <path
        d="M62 186c-7 0-11-4-10-10l4-30c2-12 10-19 22-19 13 0 21 8 22 21l3 29c1 6-3 9-10 9z"
        fill="url(#b-coat)"
      />
      <path d="M56 178h20v10a4 4 0 0 1-4 4H60a4 4 0 0 1-4-4z" fill="#1e2124" />
      <path d="M84 178h20v10a4 4 0 0 1-4 4H88a4 4 0 0 1-4-4z" fill="#1e2124" />

      {/* Neck into the head. */}
      <path
        d="M64 130c-4-12-2-24 6-33l34 6c4 10 3 21-3 30z"
        fill="url(#b-coat)"
      />
      {/* Red collar, the one bit of Rent4Ring on him. */}
      <path d="M63 124c12 5 30 6 42 1l2 8c-14 6-33 5-46-1z" fill="#c8151d" />
      <circle cx="84" cy="132" r="4" fill="#f0c23c" />

      {/* Scaled to 0.88 about (96, 83): at full size the skull sat on the
          chest like a puppy's. The transform keeps the paths readable
          instead of rewriting every coordinate. */}
      <g className="barbet__head" transform="translate(11.52 9.96) scale(0.88)">
        {/* Skull under the curls. */}
        <path
          d="M70 97c-6-13-3-27 8-35 12-9 30-8 40 3 9 9 10 23 4 34-6 12-19 18-31 16-9-2-16-8-21-18z"
          fill="url(#b-coat)"
        />
        {/* Drop ears, long and heavy the way a barbet's hang. */}
        <path
          d="M70 62c-9 1-15 9-15 21 0 13 4 25 11 32 5 5 12 3 13-4 2-14 1-30-3-44z"
          fill="url(#b-coat-dark)"
        />
        <path
          d="M124 64c9 2 14 10 13 22-1 13-6 24-13 30-6 4-12 1-13-6-1-14 3-32 8-45z"
          fill="url(#b-coat-dark)"
        />

        {/* Topknot: the curls that fall over a barbet's eyes. */}
        <path
          d="M74 66c3-6 8-8 12-5 3-6 9-7 13-2 4-5 10-4 13 2 4-3 9-1 10 5
             -6 5-15 8-25 8s-18-3-23-8z"
          fill="#5a5e62"
          opacity="0.6"
        />

        {/* Muzzle, beard and moustache — the face a barbet is known for. */}
        <path
          d="M76 108c0-9 8-15 20-15s20 6 20 15c0 11-9 20-20 20s-20-9-20-20z"
          fill="url(#b-muzzle)"
        />
        <path
          d="M78 116c-4 6-4 14 1 19 5 6 13 9 21 9s16-3 21-9c5-5 5-13 1-19
             -2 9-10 15-22 15s-20-6-22-15z"
          fill="#787c80"
        />
        {/* The beard proper: a barbet's chin tuft hangs well below the jaw,
            and it is the feature the breed is named for. */}
        <path
          d="M80 124c1 10 7 17 16 17s15-7 16-17c3 4 4 10 2 15-3 8-10 13-18 13s-15-5-18-13c-2-5-1-11 2-15z"
          fill="#6a6e72"
        />
        <ellipse cx="96" cy="103" rx="7" ry="5" fill="#15181b" />
        <path d="M92 112c2 3 6 3 8 0" stroke="#15181b" strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* Eyes, mostly hidden under the topknot, which is correct. */}
        <circle cx="83" cy="85" r="4" fill="#15181b" />
        <circle cx="109" cy="85" r="4" fill="#15181b" />
        <circle cx="84.5" cy="83.5" r="1.4" fill="#fff" opacity="0.85" />
        <circle cx="110.5" cy="83.5" r="1.4" fill="#fff" opacity="0.85" />
      </g>
    </svg>
  );
}
