# einkaufszettel
PWA für Einkaufszettel

- Mehrere Listen auf der Startseite, z. B. Lebensmittel, Drogerie, Baumarkt
- Neue Listen starten leer oder mit der Lebensmittel-Vorlage
- Pro Liste: Supermarkt und Datum, Archiv vergangener Einkäufe und Statistik
- Listen und Abschnitte frei sortierbar; Produkte lassen sich in andere Listen verschieben oder kopieren
- Suche mit Schnell-Hinzufügen (Enter legt einen nicht gefundenen Begriff als Produkt an)
- Tabs „Listen · Rezepte · Mehr“; Rezepte mit Kategorie (z. B. Hauptgericht, Kuchen & Torten) und Merkmalen
  (z. B. Weihnachten, vegetarisch), Filter und Suche auch nach Zutaten
- Rezepte und Prospekte scannen (Gemini über den Scan-Dienst, ohne Internet Texterkennung auf dem Gerät), Rezept-Links;
  fehlende Zutaten per Fingertipp auf eine Liste übernehmen, Rezepte merken und über die Suche wiederfinden
- Listen lassen sich per Einladungslink mit anderen teilen und werden live abgeglichen (siehe unten)
- Cloud-Sicherung im eigenen Google-Konto (Mehr → Mit Google anmelden): automatisch, auch zum Umzug auf ein neues Handy
- Private Listen bleiben lokal im Browser; Backup/Wiederherstellung als JSON über das Menü der Startseite,
  mit Erinnerung, wenn das letzte Backup älter als 30 Tage ist

## Neue Version veröffentlichen
Nach Änderungen an den Dateien die Konstante `CACHE` in `sw.js` erhöhen. Installierte Apps zeigen dann
„Neue Version verfügbar – Neu laden“.

## Listen teilen (Firebase einrichten)
Geteilte Listen werden über [Firebase Firestore](https://firebase.google.com/) abgeglichen. Private Listen
bleiben weiterhin nur im Browser. Einmalige Einrichtung (ca. 10 Minuten, kostenloser „Spark“-Tarif):

1. Auf <https://console.firebase.google.com> ein Projekt anlegen (Google Analytics wird nicht benötigt).
2. **Build → Authentication → Jetzt starten → Anmeldeanbieter „Anonym“** aktivieren.
3. **Build → Firestore Database → Datenbank erstellen**, Standort z. B. `europe-west3 (Frankfurt)`,
   im Produktionsmodus starten.
4. Unter **Firestore → Regeln** den Inhalt von [`firestore.rules`](firestore.rules) einfügen und veröffentlichen.
5. **Projekteinstellungen → Allgemein → Meine Apps → Web-App hinzufügen** (Hosting nicht nötig) und die
   angezeigten Werte in [`firebase-config.js`](firebase-config.js) eintragen.
6. **Authentication → Einstellungen → Autorisierte Domains**: die Domain der App ergänzen,
   z. B. `<benutzername>.github.io`.
7. Versionsnummer `CACHE` in `sw.js` erhöhen, committen, pushen.

Benutzung: In einer Liste **Menü → Liste teilen** wählen und den Einladungslink verschicken. Wer den Link
öffnet, gibt einmalig seinen Namen ein; die Liste erscheint dann auf seiner Startseite. Änderungen sind
nach etwa einer Sekunde auf allen Geräten sichtbar, offline gemachte Änderungen werden nachgeliefert.
Der Punkt am Teilen-Symbol oben zeigt den Status: grün = aktuell, gelb = wird gesendet, rot = offline.

Wer den Link kennt, kann die Liste lesen und bearbeiten. „Teilen beenden“ löst die Liste nur auf dem
eigenen Gerät (sie bleibt als private Kopie erhalten).

## Cloud-Sicherung (Google-Konto)
Unter **Mehr → Mit Google anmelden** werden Listen, Rezepte und Vorlage automatisch in Firestore gesichert
(gebündelt etwa 20 Sekunden nach einer Änderung und beim Verlassen der App; ohne Netz später). Auf einem neuen Gerät
nach der Anmeldung **Sicherung holen** wählen.

Mehrere Geräte mit demselben Konto bleiben auf demselben Stand: Beim Öffnen, beim Zurückkehren in die App und alle
2 Minuten prüft die App, ob ein anderes Gerät neuer gesichert hat. Wurde hier seitdem nichts geändert, wird der neue
Stand still übernommen. Haben beide Geräte geändert, erscheint unter „Mehr“ ein Hinweis zum Entscheiden (Übernehmen
oder Überschreiben – ganz oder gar nicht, kein Zusammenführen einzelner Einträge). Geteilte Listen sind davon nicht
betroffen: Sie laufen live über Firebase; die Sicherung merkt sich von ihnen nur Name und Einladung.

Einrichtung (einmalig, zusätzlich zu „Listen teilen“):
1. Firebase-Konsole → **Authentication → Anmeldemethode → Google** aktivieren.
2. Den aktuellen Inhalt von [`firestore.rules`](firestore.rules) unter **Firestore → Regeln** veröffentlichen
   (neu: Bereich `users/{uid}`, den nur das eigene Konto lesen und schreiben darf).

Gespeichert wird unter `users/{uid}` (Stand, Gerät, Anzahl) und `users/{uid}/teile/{n}` (die Sicherung als JSON,
in Teile zerlegt). Die Backup-Datei unter „Mehr“ funktioniert weiterhin unabhängig davon.

## Rezepte und Prospekte
- **Menü → Rezept scannen:** Foto oder Screenshot eines Rezepts. Die Zutaten erkennt Gemini über den
  [Scan-Dienst](https://github.com/mohnstollen/scan-dienst) – samt Menge und Vorschlag für den Abschnitt.
  Ohne Internet (oder wenn der Dienst nicht antwortet) übernimmt die Texterkennung auf dem Gerät
  ([Tesseract.js](https://tesseract.projectnaptha.com/), beim ersten Mal ca. 5 MB) – mit Hinweis, das Ergebnis zu prüfen.
- **Menü → Prospekt scannen:** Foto einer Prospektseite; Angebote antippen und übernehmen. Auf dem Zettel steht der
  allgemeine Begriff („Milch“), in der Notiz Laden, Preis und Produkt. Nur mit Internet.
- **Rezept-Links:** unter **Rezepte → Text oder Link** einfügen oder per Teilen übergeben. Der Scan-Dienst liest die
  maschinenlesbare Zutatenliste der Seite (schema.org/Recipe) aus.

In der installierten App (Chrome, Android) erscheint „Einkaufszettel“ außerdem im **Teilen**-Menü anderer Apps:
Screenshots, markierter Rezepttext oder der Link zur Rezeptseite lassen sich direkt übergeben. Nach dem Update kann
es einige Zeit dauern, bis Android den neuen Eintrag anzeigt – notfalls die App einmal neu installieren.

Die Adresse des Scan-Dienstes steht in [`config.js`](config.js) (`SCAN_SERVICE_URL`); `scan-client.js` ist eine
Kopie aus dem Scan-Dienst-Repo. Einrichtung des Dienstes siehe dort.

## Veröffentlichen mit GitHub Pages
Im Repository unter **Settings → Pages** als Quelle „Deploy from a branch“, Branch `main`, Ordner `/ (root)`
wählen. Die App ist dann unter `https://<benutzername>.github.io/einkaufszettel/` erreichbar und lässt sich
in Chrome auf Android über **⋮ → App installieren** auf den Startbildschirm legen.
