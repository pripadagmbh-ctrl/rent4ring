import { useState } from 'react';

/**
 * "Powered by Pripada GmbH", at the foot of the page.
 *
 * The real mark, not a redrawn one: the Rent4Ring wordmark is this project's
 * own invention and is drawn in code, but this is a company's actual identity
 * and inventing a stand-in would put a wrong logo in front of customers.
 *
 * The supplied artwork is near-black on transparent, which would vanish on
 * this background, so it is rendered as a muted white — the usual treatment
 * for a monochrome partner mark on a dark footer, and it keeps the letterforms
 * exactly as drawn. If an official light version exists, drop it in as
 * `public/pripada.png` and remove the filter.
 *
 * If the file is ever missing the image removes itself rather than leaving a
 * broken icon, and the credit still reads correctly as plain text.
 */
export default function PoweredBy() {
  const [hasLogo, setHasLogo] = useState(true);


  return (
    <a
      className="poweredby"
      href="https://pripada.de"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="poweredby__label">Powered by</span>
      {hasLogo && (
        <img
          className="poweredby__logo"
          src={`${import.meta.env.BASE_URL}pripada.png`}
          alt="Pripada"
          onError={() => setHasLogo(false)}
        />
      )}
      {/* The horizontal mark carries "PRIPADA" but not the legal form, so
          that is set alongside it. If the image is missing this falls back
          to the full name on its own. */}
      <span className="poweredby__name">{hasLogo ? 'GmbH' : 'Pripada GmbH'}</span>
    </a>
  );
}
