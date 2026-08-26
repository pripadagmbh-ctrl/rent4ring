# STAND.md — Arbeitsstand, Fortsetzung folgt

Stand: 26.08.2026, Branch `claude/rent4ring-review-0377f5`.
Zwischenstand-Upload vor Erreichen des Nutzungslimits — die Arbeit ist **nicht**
abgeschlossen. Diese Datei sagt, wo weitergemacht wird.

## Erledigt: alle 13 „hoch"-Befunde aus REVIEW.md

| # | Befund | Commit |
|---|--------|--------|
| H1+H2 | Ghost-Zeitraster-Drift & Sample-Kappung | `c3ec969` |
| H3 | Kontakt-Entprellung (Game.ts + simulate.ts) | `6bf379a` |
| H4 | Touch-Input-Reset bei Pause/Ceremony | `14055a4` |
| H5 | CanvasTexturen-Disposal in world.ts | `a3623fd` |
| H6 | PMREM-Environment-Leak (Game + GarageScene) | `b4a546e` |
| H7+H8 | Audio-Mute beim Start, Fanfare auf SFX-Bus | `15397a9` |
| H9 | Countdown-Schwellen im HUD | `927441e` |
| H10 | Voucher: Prozentsatz und Code konsistent | `0262413` |
| H12 | 0–100-Messung in simulate.ts | `0e64e80` |
| M15 | Dynamischer Bremshorizont (vorgezogen, s. u.) | `1b0af56` |
| H11 | GR Supra auf 3.0-Sechszylinder vereinheitlicht | `4da36d0` |
| H13 | iOS-Safe-Area für HUD und Touch-Pads | `2eae763` |

**Reihenfolge-Hinweis:** H12 und M15 wurden bewusst **vor** H11 gezogen, weil jede
Tuningwert-Änderung laut Auftrag den `simulate.ts`-Nachweis braucht. M12 (`at()`-Rundung)
steht noch aus und muss **vor** M03 (Linien-Interpolation) kommen.

## Referenzmessung (nach H11, mit ertüchtigtem simulate.ts)

```
=== 0–100 km/h (Vollgas, längste Gerade) ===
MINI Cooper S              sim  5.86 s  Angabe  6.8 s  Δ -0.94 s
Toyota GR Yaris            sim  3.73 s  Angabe  5.2 s  Δ -1.47 s   <- Befund M04
Toyota GR Supra            sim  4.84 s  Angabe  4.3 s  Δ +0.54 s
Porsche Taycan Turbo GT    sim  2.58 s  Angabe  2.3 s  Δ +0.28 s
Porsche 718 Spyder RS      sim  3.72 s  Angabe  3.4 s  Δ +0.32 s
Porsche 911 GT3 RS (992)   sim  3.13 s  Angabe  3.2 s  Δ -0.07 s
Ferrari 296 GTB            sim  3.17 s  Angabe  2.9 s  Δ +0.27 s

=== Lap-Times ===
MINI Cooper S            11:30.717   GR Yaris        11:23.292
GR Supra                 11:49.117   Taycan Turbo GT 11:23.242
718 Spyder RS            12:03.100   911 GT3 RS      13:22.092
Ferrari 296 GTB          11:57.650
```

Diese Zahlen sind die Vergleichsbasis für M04 und M05 — nach jeder Tuningwert-Änderung
neu messen und gegen diese Tabelle halten (Balancing darf nicht kippen).

Messlauf reproduzieren:

```bash
npx vite build --ssr scripts/simulate.ts --outDir scripts/dist && node scripts/dist/simulate.js
```

## Als Nächstes: neues Feature „Herr Müller" (vom Nutzer priorisiert)

Die Review-Abarbeitung ist auf Wunsch **pausiert**. Vorrang hat ein Feature-Paket:

1. **Herr Müller in der Garage aktiver und prominenter** — pro Fahrzeugmodell eigene
   Sprüche, mehr Mimik und Gestik, und er verabschiedet jeden Fahrer.
2. **Skriptierte Ausfahrt:** Die ersten Meter fährt das Auto automatisch — aus der
   Garage heraus, direkt links, eine Auffahrt hoch, rechts ein U-Turn, dann links in
   die Abzweigung Richtung Streckeneingang. Müller verabschiedet dabei modellbezogen.
3. **Mobile-Bug:** In der Mobilansicht der Garage verdecken Nameplate, Datenleiste und
   Müller-Sprechblase das Auto (bestätigt per Screenshot bei 375×812).

### Recherche-Ergebnisse zur Ausfahrt (damit das nicht erneut erarbeitet werden muss)

Die Basis steht in `world.ts` → `buildHomeBase()`, verankert an `approach.at(0)`:

```
group.position = approach.at(0).pos + normal*(halfWidth+9) + tangent*(-4), y -= DIP(1.9)
group.rotation.y = atan2(tangent.x, tangent.z) = 37.92°
=> Weltposition (-728.03, 278.10, 2324.41)
```

Im lokalen Frame der Basis gilt: **+z = Straßenrichtung, +x = links/von der Straße weg**,
lokal y=0.15 ist der Hofboden, y=1.9 das Straßenniveau. Die Straßenmittellinie liegt bei
lokal x ≈ −12.1. Gemessene Lage der Anfahrtspunkte im lokalen Frame:

| idx | s (m) | lokal x | lokal z |
|----|------|---------|---------|
| 0 | 0 | −12.10 | 4.00 |
| 1 | 6 | −12.10 | 9.56 |
| 2 | 12 | −12.19 | 15.08 |
| 3 | 18 | −12.72 | 20.47 |
| 4 | 24 | −14.24 | 25.58 |
| 5 | 30 | −16.95 | 30.28 |
| 6 | 36 | −20.70 | 34.48 |

**Wichtig:** Die Straße läuft nur bis etwa lokal z≈21 gerade (x≈−12,1…−12,7) und biegt
danach nach −x weg. Die Abzweigung muss deshalb bei **lokal z ≈ 18–21** liegen, nicht
weiter hinten.

**Zweite Randbedingung:** Die Gras-Ribbons der Anfahrt reichen nur bis 40 m seitlich
(`edge(i, ±1, 40, -3)`), und das Gelände fällt dabei um 3 m ab. Alles jenseits von
lokal x ≈ 26 steht über dem Nichts. Der U-Turn muss also innerhalb x ≤ 26 bleiben —
mit Rampenkopf bei x≈19 und Radius 5 geht das gerade auf (Scheitel bei x=24).

**Vorgesehene Choreografie (lokale Wegpunkte, noch nicht umgesetzt):**
Tor (1.4, 5.55) → +z bis z≈10 → Linksbogen → +x → Rampe x 11→19 (Anstieg 0,15→1,9,
12,3°) → 180°-Rechtsbogen r=5 um Mittelpunkt (19, 16.5) → Ausfahrt (19, 21.5) mit
Kurs −x → Verbindungsspur bis x≈−6 → Linksbogen in die Straße, Übergabe an den
Spieler bei etwa Anfahrtsindex 3–4, lateral ≈ −1,2 (rechte Fahrspur).

**Zwei Umbauten sind dafür nötig:**
- `buildHomeBase()`: Die Halle ist aktuell ein **massiver** Quader (`Box(16,6,11)`), das
  Auto könnte gar nicht darin stehen. Sie muss zu Wänden + Dach + offenem Tor werden,
  und Hof/Rampe/Plateau/Verbindungsspur müssen zur Choreografie passen (Plateau als
  dicker Quader, damit es am abfallenden Hang nicht schwebt).
- `Game.ts`: neue Phase `'departure'` **vor** `'approach'`. Kinematisch animieren, nicht
  über die Physik — `Vehicle.step()` zwängt das Auto per Barriere 6,5 m neben die
  Straßenmitte, und der Hof liegt 12–24 m daneben. Countdown (3,2 s) läuft im Stand in
  der Halle, danach die Fahrt, dann Übergabe. Eigene Departure-Kamera nötig, sonst
  klippt die Chase-Kamera durch die Hallenrückwand.

## Danach: restliche REVIEW.md-Befunde

Reihenfolge wie vereinbart: M01, M02, **M12 vor M03**, M04, M05 (beide gegen die
Referenzmessung oben), M06–M14, M16–M18, dann N01–N27. Zum Schluss `CHANGELOG.md`
mit erledigt / bewusst nicht erledigt (+ Grund).

Offene Nebenbefunde stehen in [OFFEN.md](OFFEN.md) — insbesondere **O1**, das M17 blockiert.

## Prüfschritte

- `npx tsc --noEmit` — meldet als einzigen Fehler O1 (vorbestehend, siehe OFFEN.md).
- Dev-Server: `npm run dev` läuft auf Port 5180. Im Worktree lief er auf 5181
  (`npx vite --port 5181 --strictPort`), weil 5180 vom Haupt-Checkout belegt war.
