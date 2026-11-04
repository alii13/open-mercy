# RUNE RIOT – technischer Bericht Alpha 0.1

Stand: 26. Oktober 2026  
Untersuchte Basis: Commit `dca03e9` auf `main`

## Ergebnis

Die vorhandene Spielbasis bleibt unverändert spielbar. Abhängigkeiten für
Frontend, Game-Server und den optionalen Supabase-Proxy wurden aus den
vorhandenen Lockfiles installiert. Der Produktionsbuild, alle Typechecks und
die vollständige reguläre Testsuite sind erfolgreich. Frontend und
Multiplayer-Worker wurden gemeinsam lokal gestartet und per HTTP sowie durch
einen Browser-Render geprüft.

Es wurde keine Spielmechanik geändert, keine neue Engine eingeführt, keine
Abhängigkeit ergänzt und nichts deployt. Das bestehende MIT-Lizenzfile und die
Urheberangabe wurden nicht verändert.

## 1. Architektur und Verantwortlichkeiten

```text
Vue 3 / Pinia / GSAP (frontend/)
  ├─ lokales Spiel gegen Bots ─────────┐
  ├─ Lobby + WebSocket-Adapter ────────┼─ shared/engine (Regeln, Karten, Bots)
  └─ Supabase-Client (Auth/Profil)     │
                                       │
Cloudflare Worker + Durable Object ────┘
  ├─ autoritative Multiplayer-Partie
  ├─ personalisierte Snapshots über shared/protocol.ts
  └─ optional: Supabase-Persistenz / RealtimeKit-Voice
```

| Bereich | Fundstelle | Befund |
| --- | --- | --- |
| Spielengine | `shared/engine/engine.ts`, `rules.ts`, `types.ts` | Frameworkfreie TypeScript-Engine. Sie mutiert einen klar definierten `EngineState` und liefert Ereignisse an den jeweiligen Host. Das ist die wichtigste zu erhaltende Grenze. |
| Kartensatz | `shared/engine/deck.ts` | Erzeugt den bestehenden 168-Karten-Satz. Kartentypen und Farben sind Domain-Typen, Grafiken gehören nicht zur Engine. |
| Lokales Spiel | `frontend/src/stores/gameStore.ts` | Pinia hostet dieselbe Shared Engine, führt Bot-Züge aus und bildet Ereignisse auf UI/Statistiken ab. |
| KI | `shared/engine/bot.ts`, `botSearch.ts`, `playout.ts`, `sim.ts` | Acht Botprofile, regelbasierte Entscheidungen und Lookahead/Simulation; deterministisch testbar über injizierbaren RNG. Derzeit nur im lokalen Spiel eingebunden. |
| Lobby | `frontend/src/components/MultiplayerLobby.vue` | Erstellung, Quick Match, Raumcode, Einladungen, Warteraum und Startmodus. Die UI zeigt derzeit bis zu 20 Plätze. |
| Multiplayer-Client | `frontend/src/stores/multiplayerStore.ts` | Dünner WebSocket-Adapter; sendet Intents und rendert nur personalisierte Server-Snapshots. Standardmäßig zeigt er noch auf den alten gehosteten Worker. |
| Multiplayer-Server | `game-server/src/index.ts`, `game.ts` | Cloudflare Worker mit einem Durable Object pro Raum. Er authentifiziert Supabase-Tokens, validiert Intents, besitzt den autoritativen Zustand, begrenzt Raten und verwaltet Räume. |
| Protokoll | `shared/protocol.ts` | Gemeinsamer Vertrag für Auth, Lobby, Intents, öffentliche Spielerinformationen, private Hand und Ereignisse. |
| Animationen | `frontend/src/composables/useCardAnimations.ts`, `useGameFeel.ts`, `useDealerIntro.ts`, `useMotion.ts`, `fx/`; `components/game/` | GSAP/Flip/MotionPath plus eigener Canvas-Effektbus; Reduced-Motion wird global berücksichtigt. |
| Supabase | `frontend/src/lib/supabase.ts`, `supabase/*.sql` | Auth, Profile, Ergebnisse, Ranglisten, Freunde, Präsenz und Einladungen. Viele Zusatzflächen erkennen fehlende SQL-Funktionen und blenden sich dann aus. |
| Supabase-Proxy | `supabase-proxy/` | Optionaler Cloudflare-Proxy für REST/Auth/Storage/Realtime, falls `supabase.co` regional blockiert ist. |
| Pages Functions | `functions/` | Geo-Endpunkt, Invite-/Share-Route und Host-Middleware für Cloudflare Pages. Nicht für die Kernengine erforderlich. |
| Mobile | `mobile/` | Nur ein unveränderter Flutter-Demo-Scaffold; noch kein Spielclient und kein Protokolladapter. |
| Promo | `promo-video/` | Separates Remotion-Projekt, kein Laufzeitbestandteil des Spiels. |

### Aktueller Spielfluss

Im Einzelspiel besitzt `gameStore` die Engine direkt. Im Multiplayer besitzt
das Durable Object die Engine; Clients dürfen nur Intents wie `PLAY_CARD`,
`DRAW`, `SWAP_HANDS` oder `CALL_UNO` senden. Der Server erzeugt pro Spieler
eine `PersonalView`, wodurch fremde Hände und die Deckreihenfolge nicht an den
Browser gelangen. Diese Trennung eignet sich gut für RUNE RIOT und darf beim
Rebranding nicht aufgeweicht werden.

## 2. Projektstruktur

| Pfad | Zweck | Laufzeitrelevant |
| --- | --- | --- |
| `frontend/` | Vue-SPA, Stores, Ansichten, Audio, Kartenbilder, WebMCP | ja |
| `shared/` | Engine, Bots, Protokoll, Raumcodes, Quick-Chat | ja |
| `game-server/` | Multiplayer-Worker/Durable Object | für Multiplayer |
| `supabase/` | additive SQL-Skripte und historische Migrationen | für Backend-Funktionen |
| `supabase-proxy/` | optionaler Reverse Proxy | optional |
| `functions/` | Cloudflare Pages Functions | nur gehostete Zusatzrouten |
| `cards/`, `cards-images/`, `cards-svgs/` | bestehende Kartenreferenzen und Renderings | teilweise/Designquelle |
| `mobile/` | Flutter-Platzhalter | nein |
| `promo-video/` | Remotion-Werbevideo | nein |
| `docs/` | technische Pläne und Screenshots | nein |

## 3. Lizenz- und Abhängigkeitsprüfung

- Das Repository steht unter MIT, Copyright 2026 alii13. Dieser Hinweis muss
  in allen wesentlichen Kopien erhalten bleiben.
- Die installierten npm-Pakete sind überwiegend MIT, Apache-2.0, ISC oder
  BSD-lizenziert. `@cloudflare/realtimekit` enthält ein Apache-2.0-Lizenzfile,
  obwohl das Feld in dessen `package.json` fehlt.
- GSAP trägt die eigene „Standard no charge“-Lizenz statt einer klassischen
  Open-Source-Lizenz. Vor einem kommerziellen Release muss geprüft werden, ob
  die geplante Nutzung und Distribution diese Bedingungen erfüllt.
- `promo-video/package.json` ist als `UNLICENSED` markiert. Das betrifft das
  separate Paket-Metadatum und sollte vor externer Veröffentlichung des
  Promo-Projekts bewusst geklärt werden.
- Die bestehenden Open-Mercy-Texte, Logos und Kartenassets sind technisch vom
  Code trennbar, enthalten aber noch zahlreiche Open-Mercy- und UNO-Bezüge.
  Sie dürfen nicht in das finale RUNE-RIOT-Produkt übernommen werden.
- Es gibt derzeit kein automatisch erzeugtes Third-Party-Notice-Dokument.
  Vor Distribution sollte eines aus den endgültig verwendeten Lockfiles
  erzeugt und im Release-Artefakt beigelegt werden.

### Sicherheits-Audit

`npm audit --omit=dev` meldet im Frontend vier Laufzeitbefunde: zwei hohe
(`zod` und die Kette über `@mcp-b/transports`) sowie zwei mittlere
(`uuid` über RealtimeKit). Die vorgeschlagenen automatischen Korrekturen sind
Major-Version-Wechsel und wurden deshalb in dieser Bestandsaufnahme nicht
blind angewandt. Für Game-Server und Proxy ist der reine Laufzeit-Audit sauber;
deren vollständige Audits melden ausschließlich Entwicklungswerkzeug-Ketten.

Empfehlung: eigenes, getestetes Upgrade-Ticket für Zod/MCP-Transport und
RealtimeKit anlegen, WebMCP- und Voice-Flows danach gezielt regressionsprüfen.

## 4. Test- und Build-Konfiguration

- GitHub Actions verwendet Node 22, `npm ci`, `npm test` und
  `npm run build` im Frontend.
- Vitest nimmt zusätzlich Tests aus `shared/` und `game-server/src/` auf.
- `npm run build` führt `vue-tsc -b` und anschließend den Vite-Build aus.
- Der Worker besitzt einen eigenen `tsc --noEmit`-Typecheck; der Proxy kann
  ebenfalls mit TypeScript geprüft werden. Beide Gates fehlen aktuell in CI.
- Flutter ist nicht in CI enthalten. Der Ordner ist derzeit nur ein Scaffold.
- Es gibt keinen Browser-End-to-End-Test und keinen WebSocket-Integrationstest
  gegen einen real gestarteten Worker.

Ausgeführte Verifikation:

| Prüfung | Ergebnis |
| --- | --- |
| `frontend: npm test` | 53 Testdateien bestanden, 1 Heavy-Datei übersprungen; 558 Tests bestanden, 1 übersprungen |
| `frontend: npm run build` | erfolgreich; Warnungen zu drei Chunks über 500 kB und gemischten statischen/dynamischen Supabase-Imports |
| `game-server: npm run typecheck` | erfolgreich |
| `supabase-proxy: npx tsc --noEmit` | erfolgreich |
| Frontend `GET /` | HTTP 200, Browser-Render erfolgreich |
| Worker `GET /health` | HTTP 200, `ok: true`, Voice/Persistenz ohne Secrets erwartungsgemäß aus |
| Worker `GET /public-rooms` | HTTP 200, leere lokale Raumliste |

Beim ersten Gesamttest überschritt ein Bot-Simulationstest auf dem kalten
System einmalig das 5-Sekunden-Limit. Isoliert lief er in 1,16 Sekunden; die
anschließende vollständige Suite war grün. Es wurde daher kein Testlimit und
kein Produktionscode verändert.

## 5. Lokaler Start

### Voraussetzungen

- Node.js 22 LTS und npm
- ein Supabase-Projekt mit aktivierten anonymen Anmeldungen
- Projekt-URL und Publishable/Anon-Key; niemals den Service-Role-Key ins
  Frontend oder in eine versionierte Env-Datei schreiben

### Frontend und Bot-Spiel

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
# In .env die eigene VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY eintragen.
npm run dev
```

Danach ist die App unter `http://localhost:5173` erreichbar. Das Bot-Spiel
verwendet die lokale Shared Engine, der Einstieg legt aber derzeit zuerst eine
anonyme Supabase-Sitzung und ein Profil an.

### Lokaler Multiplayer

Terminal 1:

```powershell
cd game-server
npm ci
Copy-Item .dev.vars.example .dev.vars
# In .dev.vars dieselben Supabase-Werte wie im Frontend eintragen.
npm run dev -- --ip 127.0.0.1 --port 8787
```

Terminal 2:

```powershell
cd frontend
npm run dev
```

In `frontend/.env` muss dafür stehen:

```dotenv
VITE_GAME_SERVER_URL=http://127.0.0.1:8787
```

Wrangler emuliert Worker und Durable Objects lokal. Ein Cloudflare-Login ist
erst für ein Deployment erforderlich. Es wurde in Alpha 0.1 nichts deployt.

### Externe Konfiguration

| Wert/Funktion | Erforderlich | Ablage |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | ja | lokale `frontend/.env` oder Hosting-Env |
| `VITE_SUPABASE_ANON_KEY` | ja | lokale `frontend/.env` oder Hosting-Env; öffentliches Client-Credential |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | für Multiplayer-Auth | lokal in der ignorierten `game-server/.dev.vars`, gehostet als Worker-Variablen |
| `SUPABASE_SERVICE_KEY` | optional | ausschließlich `wrangler secret`; persistiert Multiplayer-Ergebnisse und ermöglicht serverseitige Einladungen |
| `REALTIMEKIT_APP_ID`, `REALTIMEKIT_API_TOKEN` | optional | ausschließlich `wrangler secret`; aktiviert Voice |
| Cloudflare-Konto/API-Token | nur Deployment | nicht für lokale Entwicklung |

Wichtiger Infrastruktur-Befund: `supabase/` enthält viele additive
Feature-Skripte, aber kein vollständiges, versioniertes Basisschema, das die
zentralen Tabellen `profiles` und `game_results` für ein frisches Projekt
anlegt. Der vorhandene Upstream-Supabase-Endpunkt reicht für den Smoke-Test,
ist aber keine geeignete unabhängige RUNE-RIOT-Infrastruktur. Vor dem Umzug auf
ein eigenes Projekt muss das aktuelle Schema aus der kontrollierten Instanz
exportiert, bereinigt und als geordnete Initialmigration versioniert werden.
Das ist der einzige wesentliche Blocker für einen vollständig reproduzierbaren
Neuaufbau des Backends.

## 6. Phase 3 – konkreter Rebranding-Plan (noch nicht implementiert)

### 3.1 Schutz der Spielmechanik

1. Vor dem visuellen Umbau die aktuelle Shared-Engine-Suite als
   Verhaltensvertrag beibehalten.
2. Engine-Begriffe wie `red`, `draw4` oder `wild` zunächst intern unverändert
   lassen. Die Fantasy-Bezeichnungen werden über eine Präsentationsschicht
   gemappt; dadurch bleiben Protokoll, Saves und Regeln stabil.
3. Erst nach visueller Parität dürfen Domain-Begriffe in einer eigenen,
   migrationsfähigen Änderung umbenannt werden.

### 3.2 Designsystem

- Zentrale semantische Tokens in `frontend/src/style.css`: Obsidian-Flächen,
  dunkles Violett, Gold-Akzente, smaragdgrüne Magie, Fokus- und Kontrastfarben.
- Bestehende UI-Grundkomponenten (`Button`, `Modal`, `Stack`, `Cluster`) zuerst
  thematisieren; danach Lobby und Spielansichten. Große Touch-Ziele von
  mindestens 44 px und lesbare Textgrößen bleiben verbindlich.
- GSAP- und Canvas-Effektbus weiterverwenden: Runenpulse, Kartenflug,
  magische Einschläge und Weltereignisse ersetzen die vorhandene visuelle
  Sprache, ohne Regeln in Animationen zu duplizieren.
- `prefers-reduced-motion` und der vorhandene manuelle Motion-Schalter bleiben
  erhalten. Effekte werden über die bestehende Qualitätsstufe skaliert.

### 3.3 Eigenständige Assets

1. Asset-Inventar mit Status `ersetzen`, `prüfen`, `behalten` erstellen.
2. Wortmarke, Kartenrücken, Kartengesichter, Icons und Illustrationen neu für
   RUNE RIOT produzieren. Keine UNO-Farbflächen, Typografie, Symbole,
   Kartenrahmen oder Markenbegriffe kopieren.
3. Eine eigene Symbolfamilie definieren, zum Beispiel Rune, Fluch, Schild,
   Portal und Drachenatem. Farben dürfen nie die einzige Regelcodierung sein.
4. Karten über die bestehende `Card`-Komponente und Asset-Mapping-Schicht
   austauschen. WebP/AVIF für Illustrationen und SVG nur für eigene Symbole;
   keine neue Rendering-Engine nötig.
5. Alle Metadaten und statischen Seiten systematisch umstellen: Titel,
   Manifest/Favicon, Open Graph, strukturierte Daten, FAQ, Regeln, Audio-Texte,
   Analytics-Namen, Worker-/Paketnamen und Alttexte.
6. Lizenz- und Quellenbelege für jedes neue Asset direkt bei der Einführung
   dokumentieren.

### 3.4 Reihenfolge und Abnahmekriterien

1. Markenbasis und Tokens.
2. Kartenfront/-rückseite mit vollständiger Zustandsmatrix.
3. Runentisch und Spielfeld.
4. Lobby, Modale, Einstellungen und Ergebnisansicht.
5. Statische Seiten und Metadaten.
6. Responsive Prüfung bei 320, 375, 768 und 1440 px; Tastatur, Kontrast,
   Reduced Motion und Performance-Budget prüfen.

Abnahme: unveränderte Engine-Tests, visuell keine fremden Markenassets,
spielbare 320-px-Ansicht, keine abgeschnittenen Handkarten und keine
interaktionskritische Information nur über Farbe oder Bewegung.

## 7. Phase 4 – Integrationsplan für neue Ansichten und Regeln

### TV-Ansicht und private Smartphones

Die bestehende Serverautorität ist die richtige Grundlage. Ergänzt werden
soll eine Rolle `display`/`spectator`, die eine rein öffentliche Snapshot-Form
ohne `you.hand` erhält. Smartphone-Spieler bleiben normale authentifizierte
Sitze und empfangen weiterhin ihre `PersonalView`. Damit existiert genau eine
Partie im Durable Object; TV und Telefone sind nur unterschiedliche Projektionen.

Vorgeschlagene Protokollergänzungen:

- Join-Rolle `player | display | spectator`
- `PublicTableView` ohne private Handdaten
- sitzunabhängige Display-Verbindung, die nicht gegen das Spielerlimit zählt
- Host-Aktion zum Sperren/Entsperren neuer Sitze
- rotierbares Join-Token zusätzlich zum lesbaren Raumcode

### QR-Beitritt

Der QR-Code kodiert ausschließlich eine HTTPS-Join-URL wie
`/join/<code>?token=<short-lived-token>`. Der Raumcode bleibt als barrierearme
Alternative sichtbar. Das Token wird serverseitig geprüft und kann vom Host
erneuert werden. Eine kleine QR-Bibliothek ist erst dann gerechtfertigt, wenn
Browser- und Lizenzprüfung abgeschlossen sind; die Engine bleibt unberührt.

### Spielerlimit 2–8

Aktuell erlaubt der Server bis zu 20 Sitze (`game-server/src/seats.ts`) und die
Lobby zeigt `/20`; ältere Dokumentation nennt teilweise 10. In einer späteren
Regeländerung müssen Serverkonstante, Lobbyanzeige, Auto-Start, Quick-Match,
Tests und Simulation gemeinsam auf 8 begrenzt werden. Diese Änderung wurde in
Alpha 0.1 bewusst nicht vorgezogen, weil die bestehende Mechanik unverändert
bleiben soll.

### Optionale KI im Multiplayer

Die Botlogik ist bereits geteilt, der Durable-Object-Host nutzt sie aber noch
nicht. Bot-Sitze sollen serverseitig als normale Engine-Spieler angelegt und
über Alarme/Timer bewegt werden. Nur der Server entscheidet; ein Browser darf
keine Bot-Züge autoritativ ausführen. Profile, Schwierigkeitsgrad,
Reconnect-Verhalten und Übergabe eines Bot-Sitzes an einen Menschen benötigen
eigene Protokolltests.

### Chaos-Karten und Weltereignisse

- Neue Kartentypen werden in `shared/engine/types.ts` und `deck.ts` registriert
  und ausschließlich in `engine.ts` aufgelöst.
- Öffentliche Ereignisse erhalten typisierte `EngineEvent`-/`GameEvent`-Formen;
  UI und Animation reagieren darauf, enthalten aber keine Regelentscheidung.
- Weltereignisse brauchen einen separaten, serialisierbaren Zustand im
  `EngineState`, damit Reconnects und TV-Ansicht exakt denselben Stand sehen.
- Jede neue Regel erhält deterministische Unit- und Simulationsfälle, bevor
  Artwork oder Effekte angeschlossen werden.

### Kurze Partien

Kurze Runden sollten als versionierter Regelmodus umgesetzt werden, nicht als
zweite Engine: kleineres Deck bzw. kleinere Starthand, ein festes Rundenziel
und klar begrenzte Weltereignisse. Der Modus wird beim Raumstart festgelegt und
im Snapshot angezeigt. Bestehende Regeln bleiben als Kompatibilitätsmodus
erhalten.

### Mobile Strategie

Für die erste TV/Phone-Alpha sollte die responsive Vue-App beide Rollen
abdecken. Das verhindert eine zweite Regel- und Protokollimplementierung. Der
Flutter-Ordner ist aktuell nur ein Demo-Scaffold; eine native App sollte erst
nach Stabilisierung des gemeinsamen Protokolls entweder als dünne Hülle oder
als eigener, strikt protokollbasierter Client geplant werden.

## 8. Empfohlene nächste Schritte

1. Eigenes Supabase-Projekt anlegen und ein vollständiges Basisschema als
   geordnete Migration exportieren; Upstream-Projektwerte danach entfernen.
2. Test-Frontend gegen dieses Projekt und den lokalen Worker verbinden;
   Zwei-Browser-Multiplayer und Reconnect manuell prüfen.
3. Worker-/Proxy-Typechecks sowie einen lokalen Worker-Smoke-Test in CI
   aufnehmen.
4. Die vier Frontend-Auditbefunde in einem separaten Upgrade-Branch beheben.
5. Asset-/Markeninventar für RUNE RIOT freigeben und erst dann Phase 3 starten.
6. Vor Phase 4 einen kurzen Architekturentscheid festhalten: Web-App als
   primärer Phone-/TV-Client; Flutter vorerst außerhalb des kritischen Pfads.
