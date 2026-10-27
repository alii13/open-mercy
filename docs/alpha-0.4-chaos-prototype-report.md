# RUNE RIOT – Alpha 0.4: Chaos Prototype

Stand: 27. Oktober 2026

Branch: `feat/alpha-0.4-chaos-prototype`

## Ergebnis

Alpha 0.4 ergänzt den Couch Mode um einen optionalen, serverautoritativ gespeicherten Chaos-Modus. Classic bleibt ein unabhängiger Regelsatz mit 108 Karten, sieben Startkarten, Zieh-eine-Regel, optionalem Ausspielen der gezogenen Karte, nicht stapelbaren Strafen, +4-Prüfung und klassischer Zwei-Karten-UNO-Strafe. Mercy-, Online-, KI- und bestehende Couch-Pfade bleiben getrennt.

Chaos verwendet die Classic-Grundregeln, ergänzt genau eine Karte jeder neuen Chaos-Art, sechs dreiminütige Ereignisse und ein hartes 25-Minuten-Limit. Sämtliche Hände, Würfel, Ereignisentscheidungen, Reaktionen, Timer und Gewinnerentscheidungen liegen im Durable Object. Der Browser sendet nur Absichten und rendert personalisierte Snapshots.

Es wurden keine Supabase-Migrationen, externen Dienste, kostenpflichtigen Abhängigkeiten oder Deployments ergänzt.

## Moduswahl und Decks

- Der TV-Host wählt in der Couch-Lobby `Classic` oder `Chaos`.
- `set-couch-mode` ist nur für die authentifizierte Display-Verbindung des Raum-Hosts und nur in der Lobby erlaubt.
- Die Wahl wird im serverseitigen Raumdatensatz gespeichert und für weitere Runden desselben Raums wiederverwendet.
- Classic: 108 Karten.
- Chaos: 108 Classic-Karten plus je ein Schicksalstausch, Fluchspiegel, Würfelfluch, Runenschild und Runenwirbel.
- Arkane Chaos-Karten verlangen beim Ausspielen eine Farbauswahl. Reine Reaktionskarten können nicht als normaler Zug abgelegt werden.

## Chaos-Karten und Konfliktregeln

### Schicksalstausch

Der aktive Spieler wählt einen Gegner. Nach dem Ablegen werden beide vollständigen Hände in einer einzigen Servertransition getauscht. Andere Clients erhalten nur aktualisierte Handgrößen, nie die fremden Karten.

### Fluchspiegel

Der von einer Ziehstrafe betroffene Spieler kann den Spiegel verbrauchen und einen anderen aktiven Spieler bestimmen. Dieser zieht die vollständige Strafe sofort. Der weitergeleitete Fluch eröffnet ausdrücklich kein zweites Reaktionsfenster; dadurch sind Rekursion und Endlosschleifen ausgeschlossen.

### Würfelfluch

Der aktive Spieler wählt einen Gegner. Der Server würfelt einen W6 und erzeugt eine Strafe von 1–6 Karten. Das Ergebnis wird als öffentliches Ereignis übertragen, die gezogenen Karten selbst nur an ihren Besitzer.

### Runenschild

Der Betroffene kann das Schild im Reaktionsfenster verbrauchen. Die gesamte Strafe entfällt. Der reguläre Zugzustand wird danach serverseitig wiederhergestellt.

### Runenwirbel

Alle aktiven Hände werden gleichzeitig in aktueller Spielrichtung rotiert. Die Operation arbeitet ausschließlich auf dem Server; öffentliche Ansichten enthalten nur die neuen Kartenanzahlen.

### Priorität

1. Ein aktives zeitgesteuertes Ereignis pausiert sämtliche normalen Karten- und Schatzaktionen.
2. Bei einer neuen Ziehstrafe öffnet zuerst genau ein Chaos-Reaktionsfenster, sofern der Betroffene Schild, Spiegel oder Schatzschild besitzt.
3. Bei +4 folgt nach dem ausdrücklichen Ablehnen der Chaos-Reaktion die klassische +4-Annehmen/Anfechten-Entscheidung.
4. Schild und Spiegel sind alternative, verbrauchende Reaktionen. Die erste gültige Serveraktion schließt das Fenster; Duplikate werden abgewiesen.
5. Ein gespiegeltes Ziel zieht ohne weiteres Reaktionsfenster.
6. Nach zwölf Sekunden entscheidet der Server fair weiter: eine unbeantwortete Reaktion wird abgelehnt, eine Ereignisentscheidung automatisch getroffen.
7. Kartenauflösung ist synchron. Erst danach darf ein fälliges Ereignis beginnen.

## Zeitgesteuerte Ereignisse

Der Server markiert ein Ereignis nach drei Minuten als fällig, unterbricht aber keinen laufenden Zug. Es startet erst nach einer abgeschlossenen normalen Aktion in einem stabilen Zugzustand. `CHAOS_EVENT` sperrt das normale Ausspielen. Jeder aktive Spieler besitzt einen eigenen Status (`waiting`, `eligible`, `done` oder `not-eligible`). Ereigniszustand, absolute Deadline, Würfe und geheime Auswahlen werden mit dem Spiel gespeichert und nach Reconnect rekonstruiert.

### Schatztruhe

Alle würfeln. Ein serverseitiges W6-Stechen bestimmt einen Gewinner. Der Server vergibt eine der drei Fähigkeiten: Gegner zieht drei, eigene Karte abwerfen oder Ziehstrafe abwehren. Pro Spieler existiert höchstens eine aktive Schatzfähigkeit. Ein Schatz-Abwurf wird bei nur einer Handkarte abgelehnt und kann daher keinen sofortigen Sieg erzeugen.

### Goblin-Handel

Alle wählen geheim eine Handkarte. Erst nachdem alle Entscheidungen vorliegen, entfernt der Server alle gewählten Karten und reicht sie gleichzeitig in Spielrichtung weiter. Öffentliche Snapshots enthalten keine Karten-IDs der Auswahl.

### Runenprüfung

Alle würfeln. Bei 4–6 darf genau eine Karte gewählt und abgeworfen werden. Spieler mit nur einer Karte werden als nicht berechtigt markiert; ein Ereignis-Abwurf kann deshalb keinen regulären Sieg auslösen.

### Orakelblick

Jeder wählt einen anderen Spieler mit mindestens einer Karte. Der Server wählt eine zufällige Karte. Nur der berechtigte Empfänger erhält sie in `oracleReveal`; TV und andere Smartphones erhalten `null`.

### Sturm der Farben

Alle würfeln. Der eindeutige Höchstwurf – bei Gleichstand nach serverseitigem Stechen – wählt anschließend eine der vier aktiven Farben.

### Drachenfluch

Alle würfeln. Höchst- und Tiefstplatz werden einschließlich Stechen serverseitig bestimmt. Der Gewinner wirft nur ab, wenn mindestens zwei Karten verbleiben; der Verlierer zieht eine Karte.

Nach der Auflösung bleibt das Ergebnis vier Sekunden sichtbar. Dann stellt der Server den vorherigen Zugzustand wieder her und plant das nächste Ereignis drei Minuten später.

## Zeitlimit

- Ab Minute 20 ist `finalPhase` aktiv.
- In der Finalphase werden Schatztruhe und Drachenfluch nicht mehr neu gestartet; damit entstehen keine neuen ereignisbasierten Ziehketten.
- Minute 25 ist eine autoritative Serverdeadline.
- Ein offenes Ereignis wird automatisch vervollständigt, ein offenes Reaktionsfenster sauber abgelehnt und anschließend die Zeitentscheidung ausgeführt.
- Reihenfolge: wenigste Handkarten, niedrigste Summe der Kartenwerte, danach serverseitiges W6-Stechen.
- `winReason` unterscheidet `cards` und `time`; der TV zeigt „Normal abgelegt“ oder „Zeitentscheidung“.

## Smartphone- und TV-Funktionen

Smartphone:

- Auswahl von Chaos-Karte, Farbe und Ziel
- Schild-, Spiegel- und Schatzschild-Reaktion
- Würfeln und geheime Karten-/Spielerauswahl in Ereignissen
- Schatzfähigkeit einsetzen
- Ereignisstatus, Ereignisname, Finalphase und Restzeit
- private Orakelkarte ausschließlich auf dem berechtigten Gerät

TV:

- gespeicherter Spielmodus
- Partierestzeit und Countdown zum nächsten Ereignis
- sichtbare Spielpause mit Ereignisname
- Teilnehmerstatus und öffentliche W6-Ergebnisse
- Ereignisergebnis und gewählte Farbe im Snapshot
- Siegergrund bei normalem Ende oder Zeitentscheidung

Vorhandene Komponenten und CSS-Karten werden wiederverwendet; es gibt keine neuen Illustrationen oder Animationsexperimente.

## Tests

Automatisiert abgedeckt:

- Chaos-Deck mit exakt 113 Karten und je einer neuen Karte
- Schicksalstausch und Snapshot-Geheimhaltung
- Runenschild gegen Ziehstrafe
- einmaliger Fluchspiegel ohne Reaktionskette
- alle sechs Ereignisse mit kontrolliertem RNG und automatischen Entscheidungen
- private Orakelansicht gegenüber TV
- Drei-Minuten-Fälligkeit ohne Unterbrechung des laufenden Zugs
- Zeitgewinner nach Kartenanzahl, Wertsumme und Würfelstechen
- Zeitlimit-Ereignis und `winReason`
- vollständige vorhandene Engine-, Bot-, Store-, Server- und UI-Regressionssuite
- Game-Server-Typecheck
- Frontend-Produktionsbuild
- echter lokaler Couch-Smoke-Test für Classic und Chaos mit jeweils zwei Spieler-WebSockets und separater TV-Verbindung

Abschlussergebnisse:

- Vitest: **600 bestanden**, 1 vorhandener Test übersprungen; 59 Testdateien bestanden
- Bot-Determinismus isoliert: **10/10 bestanden** in 1,47 Sekunden
- Frontend-Produktionsbuild: bestanden; die bekannten Chunk- und Supabase-Importwarnungen bleiben unverändert
- Game-Server-Typecheck: bestanden
- Couch-Smoke Classic: bestanden
- Couch-Smoke Chaos: bestanden, einschließlich gespeichertem `chaos`-Regelsatz, 113 Karten und privater TV-Ansicht

Der Bot-Determinismustest überschritt im parallelen Gesamtlauf wiederholt das globale 5-Sekunden-Limit, obwohl er isoliert in 1,47 Sekunden bestand. Nur dieser Test besitzt deshalb nun ein lokales 15-Sekunden-Limit; Botlogik und Suchparameter wurden nicht verändert. Der anschließende vollständige Lauf bestand mit 600 Tests.

Timer- und Würfeltests verwenden injizierte Zeit beziehungsweise deterministische RNG-Funktionen; es gibt keine realen Wartezeiten.

## Bekannte Einschränkungen und offene Punkte

- Die Zielspielzeit von 15–20 Minuten ist technisch unterstützt, aber noch nicht durch genügend reale Runden balanciert. Kartenhäufigkeit, Ereignisreihenfolge und Fristen benötigen physische Spieltests.
- Die sechs Ereignisse rotieren im Prototyp deterministisch, damit jedes innerhalb wiederholter Tests sicher vorkommt. Würfel, automatische Karten-/Zielwahl und Schatzbelohnung bleiben serverseitig zufällig.
- Nach 64 unmittelbar aufeinanderfolgenden Würfelgleichständen greift eine serverseitige Zufallsauswahl als Sicherheitsgrenze. Damit kann kein theoretisch unendliches Stechen den Raum blockieren.
- Ein echter Hardwaretest mit TV sowie mehreren iOS-/Android-Telefonen im selben WLAN steht aus. Der bestandene lokale Mehrclient-Lauf prüft Protokoll, Regelsatz und Privatsphäre, ersetzt aber keine Touch-/Safe-Area-Abnahme.
- Der vorhandene Supabase-basierte Couch-Smoke-Test kann lokal Rate Limits des Auth-Dienstes treffen. Es wurden keine Zugangsdaten oder Tokens in Logs aufgenommen.
- Eine Changelog-Einstufung (`quiet` oder `loud`) wurde nicht gewählt, weil die Repository-Regel diese Entscheidung ausdrücklich dem Menschen vorbehält. Vor einem PR muss sie ergänzt werden.
- Es erfolgte kein öffentlicher Worker- oder Frontend-Deploy.

## Lokale Startanleitung

1. Im Repository-Root `Start-Rune-Riot.bat` per Doppelklick starten oder in PowerShell `./scripts/Start-Rune-Riot.ps1` ausführen.
2. Die angezeigte Couch-/TV-Adresse öffnen.
3. `Neues Spiel erstellen` wählen.
4. In der Lobby `Classic` oder `Chaos` auswählen.
5. Mit 2–8 Smartphones den QR-Code öffnen, Namen vergeben und `Bereit` wählen.
6. Am TV `Partie starten` wählen.
7. Für Chaos-Tests mindestens ein Ereignis abwarten oder in automatisierten Tests die kontrollierte Uhr verwenden.
8. Beenden mit `Stop-Rune-Riot.bat` oder `./scripts/Stop-Rune-Riot.ps1`.

Manuelle Einzelprüfungen:

```powershell
cd frontend
npm test -- --run
npm run build

cd ../game-server
npm run typecheck
```

## Wesentliche Dateien

- `shared/engine/types.ts`, `deck.ts`, `rules.ts`, `engine.ts`: Regelsatz und Kartenmodell
- `shared/protocol.ts`: typisierte Chaos-Intents, Ereignisse und personalisierte Snapshotdaten
- `game-server/src/chaos.ts`: Ereignisautomat, Zeitgrenzen, Würfel und Zeitgewinner
- `game-server/src/game.ts`: Chaos-Karten, Reaktionen, Schätze und Privacy-Personalisierung
- `game-server/src/index.ts`: Modusspeicherung und Durable-Object-Alarme
- `frontend/src/stores/multiplayerStore.ts`: dünne Intent-/Snapshot-Anbindung
- `frontend/src/components/couch/CouchController.vue`: funktionale Smartphone-Interaktionen
- `frontend/src/components/couch/CouchHost.vue`: Moduswahl, Timer, Ereignis- und Siegeranzeige
- `game-server/src/chaos.test.ts`: kontrollierte Chaos-Regel- und Timerabdeckung
