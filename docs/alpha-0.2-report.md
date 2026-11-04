# RUNE RIOT – Alpha 0.2: Fantasy Reforged

Stand: 26. Oktober 2026

## Ergebnis

Die bestehende Open-Mercy-Spielengine wurde nicht ersetzt. RUNE RIOT nutzt weiterhin dieselben Regeln, Kartenwerte, Spielzustände, KI-Abläufe und Multiplayer-Nachrichten, rendert die aktive Spieloberfläche aber als eigenständiges Dark-Fantasy-Kartenspiel.

Die lokale Anwendung wurde als Gast betreten, die Lobby geöffnet und eine VS-KI-Partie gestartet. Kartenauswahl und Spielzug wurden zusätzlich in der laufenden Partie geprüft: Zwei Karten waren spielbar, die Flammenrunen-Karte „Draw Two“ wurde ausgewählt und der folgende Zustandswechsel korrekt verarbeitet.

## Umgesetzte Änderungen

### Spieltisch

- Dunkle Obsidian-/Steinoberfläche mit Runenkompass, Gravuren, Vignette und dezenten magischen Glutpunkten.
- Zentraler Zieh- und Ablagestapel mit klar getrennten Interaktionsflächen.
- Spielrichtung und aktuelle Familie werden weiterhin aus dem vorhandenen Zustand bezogen und als `CW`/`CCW` sowie `FLAME`, `FROST`, `GROVE` oder `STORM` angezeigt.
- Die vorhandene 25-Karten-Anzeige heißt visuell „RUIN“, ohne ihre Regel oder Grenzwerte zu verändern.
- Gegneranzeige, Kartenanzahl und aktiver Zustand bleiben erhalten; der aktive Sitz und die eigene Hand erhalten eine smaragdgrüne Lichtkante.
- Desktop- und Smartphone-Anordnung wurden mit der realen laufenden Partie geprüft.

### Karten

`frontend/src/components/game/Card.vue` rendert die Karten vollständig mit Vue, CSS und Lucide-Vektorsymbolen. Die bisher verwendeten Kartenbilder werden von der aktiven Kartenkomponente nicht mehr geladen.

Die vier Familien unterscheiden sich nicht nur durch Farbe:

| Familie | Farbe | zusätzliches Symbol/Muster |
| --- | --- | --- |
| Flammenrunen | Rot | Flamme und Strahlenstruktur |
| Frostsiegel | Blau | Schneeflocke und Kristallgitter |
| Waldzeichen | Grün | Blatt und organische Ringlinien |
| Sturmglyphen | Gelb/Gold | Blitz und diagonale Glyphen |

Alle vorhandenen `CardType`-Werte sind weiterhin vollständig und typsicher abgebildet:

| bestehender Typ | RUNE-RIOT-Darstellung |
| --- | --- |
| `number` | große Ziffer, Familienrune, „Rune“ |
| `skip` | Bannzeichen, „Ward“ |
| `reverse` | Drehrune, „Reversal“ |
| `draw2` | Stapelsymbol und `+2` |
| `skipEveryone` | Gruppensymbol, „Time Lock“ |
| `discardAll` | Lösch-/Stapelsymbol, „Rune Purge“ |
| `wild` | Arkana-/Palettensymbol, „Wild Arcana“ |
| `draw4` | Stapelsymbol und `+4` |
| `draw6` | Stapelsymbol und `+6` |
| `draw10` | Stapelsymbol und `+10` |
| `wildReverseDraw4` | Umkehrrune und `+4`, „Fate Reversal“ |
| `wildColorRoulette` | Kreissiegel, „Chaos Wheel“ |

Die neue Kartenrückseite ist ein eigenes SVG-Siegel aus Obsidian, Violett, antikem Gold und smaragdgrüner Magie. Auch die für Zieh-/Ablageanimationen dynamisch erzeugte Kartenrückseite wurde darauf umgestellt.

### Menüs, Lobby und Oberflächen

- Startscreen, Bootscreen, Authentifizierung, Profil, Lobby, Spielmodi, Ergebnisdialog, Regeln, Einstellungen, Feedback und Share-Grafiken verwenden die RUNE-RIOT-Wortmarke und die neue Farb-/Typografiesprache.
- Display-Schrift: `Cinzel` mit systemischem Serif-Fallback; Fließtext: `Inter` mit System-Fallback.
- Primäraktionen verwenden eine große, gut lesbare Goldfläche; sekundäre magische Zustände sind smaragdgrün oder violett.
- Lobby-Karten wurden als Runen-/Artefaktflächen gegliedert. Raumcode, Spielmodi und Tischbereich behalten ihre vorhandenen Aktionen und Datenflüsse.
- Der sichtbare letzte-Karte-Ruf lautet „RIOT!“. Der bestehende interne Eventname `call-uno` und die Quick-Chat-Wire-ID `mercy` bleiben aus Kompatibilitätsgründen unverändert.
- Rangnamen der beiden alten markenspezifischen Stufen wurden in „Rune Sovereign“ und „Worldforged“ umbenannt.
- Favicon, Open-Graph-SVG und Canvas-Share-Grafiken verwenden eigene Runen-/Siegelgrafiken.

### Animationen und Barrierearmut

- Die vorhandenen GSAP-Abläufe für Ziehen, Ablegen, Spezialkarten und Spielerwechsel wurden beibehalten.
- Karten erhalten nur bei spielbaren/ausgewählten Zuständen dezentes Leuchten, Pulsieren und Schimmern.
- Richtungswechsel, Farblicht, Handzug-Hervorhebung, Spezialkartenblitz sowie Sieg-/Niederlage-Stempel nutzen die neue Palette.
- Alle neu hinzugefügten Daueranimationen werden unter `prefers-reduced-motion: reduce` deaktiviert. Der Reduced-Motion-Endzustand wurde gesondert aufgenommen.

## Bewusst nicht geändert

- Keine Regel- oder Engine-Datei wurde für neue Regeln erweitert.
- Keine Karten, Events oder Protokollnachrichten wurden ergänzt.
- Keine Supabase-Migration wurde geändert.
- Keine neue Laufzeitabhängigkeit und kein kostenpflichtiger Dienst wurde ergänzt.
- Bestehende Lizenz- und Urheberhinweise sowie die Musik-/SFX-Attribution bleiben erhalten.
- Es erfolgte kein Deployment.

## Qualitätssicherung

| Prüfung | Ergebnis |
| --- | --- |
| `cd frontend && npm run build` | erfolgreich; Vue-Typecheck und Vite-Produktionsbuild abgeschlossen |
| `cd frontend && npm test -- --testTimeout=15000` | 558 bestanden, 1 bewusst übersprungen |
| gezielter Bot-Test `botStrength.test.ts` | 10/10 bestanden |
| `cd game-server && npm run typecheck` | erfolgreich |
| `git diff --check` | erfolgreich; nur Windows-Zeilenendungs-Hinweise für neu geschriebene SVG/Vue-Dateien |
| Gastanmeldung und Lobby | erfolgreich gegen die vorhandene lokale Entwicklungsumgebung |
| VS-KI-Partie starten | erfolgreich |
| spielbare Karte auswählen und ablegen | erfolgreich; Flammenrune `draw2` wurde verarbeitet |
| Desktopdarstellung | geprüft bei 1440 × 1000 |
| Smartphone-Spiel/Lobby | geprüft bei 390 × 844 CSS-Pixeln |
| Reduced Motion | geprüft; statischer Endzustand ohne laufende Choreografie |

Der Standardlauf `npm test` wurde zweimal ausgeführt. Dabei bestanden jeweils 557 Tests; der unveränderte deterministische Bot-Simulationstest überschritt unter paralleler Last ausschließlich das voreingestellte 5-Sekunden-Limit. Derselbe Test bestand gezielt in 3,07 Sekunden. Der vollständige unveränderte Bestand bestand anschließend mit einem nur für den Aufruf gesetzten 15-Sekunden-Limit (558 bestanden). Die Repository-Konfiguration wurde dafür nicht aufgeweicht.

Bekannte, bereits bestehende Buildhinweise:

- Supabase wird in Teilen statisch und dynamisch importiert; Vite weist deshalb auf nicht trennbare Chunks hin.
- Einige bestehende Bundles überschreiten 500 kB. Für Alpha 0.2 wurde keine Architektur-/Chunking-Änderung erzwungen.

## Screenshots

- [Startscreen – Desktop](screenshots/alpha-0.2-landing-desktop.png)
- [Startscreen – schmale Ansicht](screenshots/alpha-0.2-landing-mobile.png)
- [Lobby – Desktop](screenshots/alpha-0.2-lobby-desktop.png)
- [Lobby – Smartphone 390 × 844](screenshots/alpha-0.2-lobby-mobile.png)
- [Spieltisch – Desktop](screenshots/alpha-0.2-game-desktop.png)
- [Spieltisch – Smartphone 390 × 844](screenshots/alpha-0.2-game-mobile.png)

Die Screenshots wurden lokal in Microsoft Edge gegen den Vite-Entwicklungsserver aufgenommen. Die Landing-Ansicht nutzt bewusst die emulierte Reduced-Motion-Variante, damit der stabile Endzustand statt eines Animations-Zwischenbilds dokumentiert ist.

## Offene Punkte

1. Ein echter Mehrspieler-Smoke-Test mit zwei gleichzeitig verbundenen Browsern wurde nicht ausgeführt. Store-, Engine- und Protokolltests bestehen; für die nächste Abnahme sollte zusätzlich ein zweites Gerät oder Browserprofil verbunden werden.
2. Die statischen, suchmaschinenorientierten Regel-/FAQ-Seiten unter `frontend/public/` enthalten weiterhin historische Open-Mercy- und UNO-Regeltexte. Sie wurden nicht pauschal umgeschrieben, weil rechtliche Einordnung, Suchstrategie und Regelwortlaut separat geprüft werden sollten. Die aktive SPA-Spieloberfläche und ihre Karten verwenden diese Grafiken/Marken nicht.
3. Alte Kartenbilddateien bleiben als ungenutzte Legacy-Assets im Repository, weil Alpha 0.2 ausdrücklich keine funktionierenden Komponenten entfernen soll. Der neue aktive Kartenrenderer referenziert sie nicht.
4. Kanonische Produktions-URLs verweisen weiterhin auf die bestehende Domain. Eine neue RUNE-RIOT-Domain wurde nicht erfunden oder deployed.
5. Ein Changelog-Eintrag wurde noch nicht ergänzt: Laut Repository-Vorgabe muss vor einer Veröffentlichung ein Mensch `quiet` oder `loud` festlegen. Da kein Deployment und keine PR freigegeben wurden, bleibt diese Release-Entscheidung offen.
6. Die bestehende maximale Raumgröße wurde nicht auf 2–8 geändert, da dies Spiellogik/Serververhalten berühren würde und für Alpha 0.2 ausdrücklich keine Mechanikänderung vorgesehen war.

## Empfohlener nächster Schritt

Vor einer Veröffentlichung: Zwei-Client-Multiplayer-Smoke-Test durchführen, Changelog-Lautstärke festlegen, die statischen Regel-/SEO-Seiten rechtlich und redaktionell rebranden und erst danach Domain-/Deployment-Fragen entscheiden.
