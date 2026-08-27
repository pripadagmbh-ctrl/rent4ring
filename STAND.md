# STAND.md — Arbeitsstand

Stand: 26.08.2026, Branch `claude/rent4ring-review-0377f5`. Alle 13 „hoch"-Befunde aus
REVIEW.md **und** der komplette restliche M/N-Backlog sind erledigt (der M/N-Teil kam
über einen parallelen Session-Strang, per PR #2 gemergt). Live auf GitHub Pages:
<https://pripadagmbh-ctrl.github.io/rent4ring/>

## Was gerade lief: Grafikfehler-Rundfahrt (PR #3, gemergt)

Nutzer meldete Grafikfehler „am Anfang der Garage, vor der Rennstrecke und auf der
Rennstrecke" plus durchsichtige/nicht modelltreue Fahrzeuge. Komplette Erkundungsfahrt
gemacht, jeweils per pausiertem echten Spielzustand (`game.paused=true` +
`composer.render()` + Pixel-Sampling des WebGL-Canvas) verifiziert, nicht nur per
Sichtprüfung — Screenshots direkt nach `click("Drive now")` sind unzuverlässig (zeigen
teils einen stehengebliebenen/leeren Frame, kein echter Bug).

**Gefunden und behoben:**
1. **Hallenbeleuchtung überbelichtet** — Punktlicht in `buildHomeBase()` (world.ts) mit
   Intensität 42 blies zusammen mit dem Bloom-Pass (Threshold 0,86–0,9) das komplette
   Halleninnere zu einer strukturlosen hellen Fläche aus. Auf 8 reduziert.
2. **Ausfahrt-Kamera-Komposition** — der feste Establishing-Shot-Anchor in
   `departure.ts` stand zu nah/zu direkt vor der 5,2 m breiten Tordurchfahrt, sodass die
   Schuppenwand jede Einstellung dominierte (auch nach Behebung von Punkt 1 noch
   sichtbar — zwei Fehlversuche dokumentiert im Kommentar über `CAMERA_ANCHOR`).
   Jetziger Wert `(-9.0, 3.6, 13.5)`: echter 3/4-Shot von der linken, nie befahrenen
   Hofseite, verifiziert über den gesamten aktiven Bereich u=0–0,40 (Rampe + U-Turn).
3. **Kamerawechsel zu früh** — Wechsel auf fahrzeugrelative Chase-Kamera lag bei u=0,17,
   mitten in der engen Rampen-/Kehren-Passage nahe an Stützmauern. Auf u=0,42 angehoben
   (= `departureSpeedAt`'s Rampe/Verbindungsspur-Grenze).
4. **Anfahrtsstraße:** Fahrbahn-/Bankett-/Wiesen-Ribbons liefen einseitig (Himmel durch
   die Fahrbahn an Hängen sichtbar) → `side: THREE.DoubleSide`. Dorfhäuser hatten festen
   Randabstand unabhängig von der eigenen Breite → skaliert jetzt mit Hausbreite. Hecken
   22 m lang → schnitten in Kurven über den Asphalt → auf 10 m gekürzt. Die Wiese der
   ersten 50 m überschnitt Hof/Rampe/Verbindungsspur der Ausfahrt → dort zurückgenommen.
5. **Leitplanken:** Pfosten nur 1,0 m lang und nur an jedem zweiten Segment → schwebten
   auf abfallendem Gelände sichtbar über dem Boden. Jetzt 1,9 m, unter Flur einbetoniert,
   an jedem Segment.
6. **Fahrzeug-Transparenz/-Modelltreue:** war bereits in einem vorherigen Commit
   (`876010a`) behoben (opakes statt durchsichtiges Glas) — hier nur verifiziert
   (GT3 RS, 296 GTB, GR Supra in der Garage geprüft, alle unauffällig).

**Wichtige Lektion für künftige Grafik-Debugging-Sessions in diesem Projekt:** Ein
naiver Ray-gegen-Welt-AABB-Test liefert bei rotierten Boxen (z. B. die um ~38° gedrehte
Hofgruppe) massiv falsche Näherungstreffer — die Welt-AABB einer rotierten Box ist immer
größer als die Box selbst und kann Punkte als „innerhalb" markieren, die es geometrisch
nicht sind. Korrekt ist nur ein Test nach Transformation des Rays in den Objekt-
Lokalraum (`inverse(matrixWorld)` anwenden, dann gegen die unrotierte lokale
BoundingBox prüfen). Beispielcode dafür liegt im Zwischenverlauf dieser Session.

## Nicht vergessen — zwei neue Aufgaben vom Nutzer (noch nicht bearbeitet)

1. **Sound-Bug Mobile:** Auf Tablets wird Ton ausgegeben, auf Smartphones im Browser
   nicht. Noch nicht untersucht — vermutlich Autoplay-/Gesture-Policy-Unterschied
   zwischen Tablet- und Phone-Browsern (`audio.ts` `start()`/`ctx.resume()`).
2. **Feature-Wunsch:** Die komplette Flotte (alle 7 Autos) soll sichtbar rechts neben
   der Auffahrt (der Rampe/dem Hof der Ausfahrt-Choreografie) stehen — vermutlich als
   statische Deko-Instanzen in `buildHomeBase()`/`world.ts`, ähnlich den Häusern/Bäumen
   als `InstancedMesh` oder einzelne `CarMesh`-Instanzen ohne Physik.

## Frühere Merges (Kontext für die Historie)

- PR #1: Review-Fixes dieser Session (H1–H13) gemergt mit einer parallelen Session, die
  dieselben Befunde unabhängig umgesetzt hatte (Merge-Commit `60fc97b`).
- PR #2 (extern gemergt, `378f505`): eine weitere parallele Session hat den kompletten
  restlichen M/N-Review-Backlog erledigt (Physik-Tuning M04/M05/N11-14, Rendering-
  Disposal H5/M08/M09, Audio M07/M14/N25, UI M02/M13/N03/N06/N09/N10/N19/N23/N24,
  Track M10/M12/N15/N16, Web M16/M18/N27, Tools H12/M15/N17/N18/M06). `REVIEW.md` ist
  damit inhaltlich vollständig abgearbeitet — nur `CHANGELOG.md` (erledigt / bewusst
  nicht erledigt) steht laut ursprünglichem Auftrag noch aus.
- PR #3 (dieser Durchlauf): die oben beschriebenen Grafikfehler.

## Prüfschritte

- `npx tsc --noEmit` — komplett grün (kein offener Fehler mehr, O1 aus OFFEN.md ist
  durch `@types/node` in der parallelen Session behoben).
- `GITHUB_PAGES=true npm run build` — grün.
- Dev-Server im Worktree: `npx vite --port 5181 --strictPort` (Port 5180 ist vom
  Haupt-Checkout belegt). Nach `npm install` im Worktree ggf. den Server neu starten —
  Vites Dependency-Re-Optimierung nach Lockfile-Änderungen kann den laufenden Prozess in
  einen kaputten Zustand bringen (beobachtet: ERR_CONNECTION_RESET-Fehlerkaskade in der
  Konsole, HMR liefert dann falsche/leere Frames).
