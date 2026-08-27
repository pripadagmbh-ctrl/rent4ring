interface Props {
  /** Widens the eyes and drops the jaw for the "brake NOW" moments. */
  urgent?: boolean;
  /** He is apologising to Herr Müller, not talking to you. */
  sheepish?: boolean;
  /** Works the jaw and nods the head, the way Herr Müller does on the floor. */
  talking?: boolean;
  className?: string;
}

/**
 * Dale, the instructor. Herr Müller's oldest friend and the only man he lets
 * sit in the passenger seat of his own cars.
 *
 * Drawn like the rest of the yard: flat shapes, a few gradients, one shadow.
 * The things that make him him are the open-face lid buried under decades of
 * paddock stickers, the glasses under it, the moustache, and the boom mic he
 * talks into whether or not it is switched on.
 */
export default function Dale({
  urgent = false,
  sheepish = false,
  talking = false,
  className,
}: Props) {
  const classes = [
    'dale',
    urgent && 'dale--urgent',
    sheepish && 'dale--sheepish',
    talking && 'dale--talking',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg className={classes} viewBox="0 0 160 190" role="img" aria-label="Dale, the instructor">
      <defs>
        <linearGradient id="d-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e6c0a0" />
          <stop offset="100%" stopColor="#c99a76" />
        </linearGradient>
        <linearGradient id="d-lid" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#f4f2ec" />
          <stop offset="55%" stopColor="#d9d6ce" />
          <stop offset="100%" stopColor="#b3b0a8" />
        </linearGradient>
        <linearGradient id="d-suit" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#2c3a55" />
          <stop offset="100%" stopColor="#1a2434" />
        </linearGradient>
      </defs>

      {/* Shoulders: instructor's jacket with a red flash. */}
      <path d="M20 190c0-27 19-45 60-45s60 18 60 45z" fill="url(#d-suit)" />
      <path d="M56 152c8 27 12 31 24 31s16-4 24-31l-9-4c-5 21-9 25-15 25s-10-4-15-25z" fill="#c8151d" />

      {/* Neck. */}
      <path d="M66 128h28v26H66z" fill="#c99a76" />

      {/* Everything from the jaw up rides in one group, so the nod turns the
          head — lid, glasses, mic and all — rather than sliding the face out
          from under the helmet. */}
      <g className="dale__head">
      {/* Face. Sits low enough that the open lid above never reaches it —
          getting this wrong buried his eyes under the peak. */}
      <ellipse cx="80" cy="104" rx="30" ry="32" fill="url(#d-skin)" />
      <ellipse cx="49" cy="106" rx="6" ry="9" fill="#c99a76" />
      <ellipse cx="111" cy="106" rx="6" ry="9" fill="#c99a76" />

      {/* Glasses — thin metal, always slightly down his nose. */}
      <g className="dale__eyes">
        <circle cx="68" cy="106" r="10.5" fill="#dceaf3" fillOpacity="0.45" stroke="#2b3038" strokeWidth="2.4" />
        <circle cx="94" cy="106" r="10.5" fill="#dceaf3" fillOpacity="0.45" stroke="#2b3038" strokeWidth="2.4" />
        <path d="M78.5 105h5" stroke="#2b3038" strokeWidth="2.4" fill="none" />
        <circle cx="68" cy="106" r="3.6" fill="#20252b" />
        <circle cx="94" cy="106" r="3.6" fill="#20252b" />
        <circle cx="69.3" cy="104.6" r="1.2" fill="#fff" opacity="0.85" />
        <circle cx="95.3" cy="104.6" r="1.2" fill="#fff" opacity="0.85" />
      </g>

      {/* Moustache and mouth. */}
      <path d="M65 123c4-4 10-5 15-5s11 1 15 5c-5 3-10 4-15 4s-10-1-15-4z" fill="#6b563f" />
      <ellipse className="dale__mouth" cx="80" cy="133" rx="7" ry="4" fill="#7d3f3f" />

      {/* The open lid, sitting on top of the skull and clear of his face, and
          a working life's worth of paddock stickers on it. */}
      <path d="M46 92c0-24 15-40 34-40s34 16 34 40z" fill="url(#d-lid)" />
      <g>
        <rect x="52" y="72" width="19" height="8" rx="1.5" fill="#d8232f" transform="rotate(-10 61 76)" />
        <rect x="74" y="58" width="25" height="7" rx="1.5" fill="#1b4fa0" />
        <rect x="96" y="70" width="15" height="9" rx="1.5" fill="#f2c400" transform="rotate(10 103 74)" />
        <rect x="50" y="83" width="14" height="7" rx="1.5" fill="#2f9e5a" transform="rotate(5 57 86)" />
        <rect x="66" y="67" width="21" height="6" rx="1.5" fill="#111418" />
        <rect x="90" y="84" width="19" height="6" rx="1.5" fill="#e0662a" transform="rotate(-5 99 87)" />
        <rect x="63" y="79" width="24" height="6" rx="1.5" fill="#7c3aa8" />
      </g>
      {/* Brim, stopping short of the glasses. */}
      <path d="M44 92c0-3 3-6 7-6h58c4 0 7 3 7 6 0 2-2 4-5 4H49c-3 0-5-2-5-4z" fill="#22262c" />
      {/* Chin straps down past his ears. */}
      <path d="M52 96c1 10 4 17 9 22l-5 5c-7-6-11-16-12-27z" fill="#2c3138" />
      <path d="M108 96c-1 10-4 17-9 22l5 5c7-6 11-16 12-27z" fill="#2c3138" />

      {/* Boom mic, permanently live. */}
      <path d="M56 122c1 6 4 12 8 16l-5 5c-6-5-10-13-11-20z" fill="#22262c" />
      <ellipse cx="64" cy="145" rx="7" ry="5.5" fill="#33383f" />
      <ellipse cx="64" cy="145" rx="3.6" ry="2.8" fill="#12151a" />
      </g>
    </svg>
  );
}
