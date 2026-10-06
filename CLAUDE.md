# Piano di carico container

Strumento web per preparare i piani di carico dei container. L'utente inserisce i colli (misure, peso, quantità, sovrapponibile sì/no). Il tool sceglie il container più piccolo che basta, calcola una disposizione e la mostra in modo grafico. L'utente può poi modificare la disposizione a mano.

## Chi lo usa

- **Utente finale:** una persona che non è esperta di computer e lavora in logistica.
- **Lingua:** tutta l'interfaccia è in **italiano semplice**. Usa frasi brevi, verbi chiari e niente termini tecnici.
- **Messaggi di errore:** dicono cosa è successo e come risolvere.

## Struttura del progetto

- **Un solo file:** `index.html` contiene HTML, CSS e JavaScript. Non ci sono build, framework o `package.json`. Mantieni questa scelta, salvo richiesta esplicita.
- **Pubblicazione:** il sito è su **GitHub Pages**, dal branch `master`, cartella root.
- **Librerie esterne:** sono caricate da CDN con tag `<script>` (versione UMD):
  - `three.js r128` (cdnjs) per la vista 3D. Se non si carica, la vista 3D si nasconde e resta la vista laterale.
  - `SheetJS xlsx 0.18.5` (cdnjs) per leggere e scrivere i file Excel.
- **Font:** solo font di sistema (`system-ui`; per i titoli Bahnschrift, Roboto Condensed o Arial Narrow). Niente Google Fonts, per non inviare l'IP dei visitatori a Google (GDPR).
- **Nessun server:** i dati restano nel browser, salvati in `localStorage` con la chiave `pianoCarico.v1`.

## Regole di carico (dal cliente)

1. **Rotazione:** i colli possono ruotare solo sul piano (si scambiano lunghezza e larghezza). **Non si ribaltano mai**: l'altezza resta sempre la stessa.
2. **Sovrapponibile:** un collo "sovrapponibile" può avere altri colli sopra. Un collo "non sovrapponibile" può stare sopra altri colli, ma niente sopra di lui.
3. **Appoggio su due colli:** un collo può appoggiare su **massimo 2 colli** se la loro altezza **differisce meno di 5 cm**. Entrambi i valori sono modificabili in "Container e regole": `tol` (5 di default) e `maxSup` (2 di default, da 1 a 4).
4. **Appoggio minimo:** la base deve essere appoggiata almeno per `minSup`% (80% di default, modificabile). Il calcolo automatico prima prova con appoggio quasi pieno (98%) per avere piani ordinati. Solo se non basta usa `minSup`.
5. **Limiti del container:** si controllano il peso massimo, l'altezza interna e le misure della porta (larghezza e altezza).

## Container di default (misure interne in cm)

| Nome | L | W | H | Porta L × H | Peso max kg |
|---|---|---|---|---|---|
| 20' Standard | 589 | 235 | 239 | 234 × 228 | 28200 |
| 40' Standard | 1203 | 235 | 239 | 234 × 228 | 26700 |
| 40' High Cube | 1203 | 235 | 269 | 234 × 258 | 26500 |
| 45' High Cube | 1355 | 235 | 269 | 234 × 258 | 27600 |

Sono valori tipici. L'utente li modifica in "Container e regole".

## Sistema di coordinate

- `x` = distanza dalla parete di fondo verso le porte (lunghezza).
- `y` = distanza dal **lato sinistro guardando dalle porte** (larghezza).
- `z` = altezza da terra.
- Tutte le misure sono in **cm**, i pesi in **kg**.
- **Vista dall'alto (SVG):** fondo a sinistra, porte a destra, y disegnata capovolta (`W - y - w`), quindi il lato sinistro è in basso.
- **Vista 3D:** X3D = x, Y3D = z, Z3D = W - y.

## Codice: le parti principali

La logica di calcolo è tra i commenti `CORE-START` e `CORE-END`. È fatta di funzioni pure, senza DOM, e si può testare con Node.

- **`expandRows(rows)`:** trasforma le righe della tabella in unità singole. Ogni unità ha `uid` = `"<indiceRiga>-<n>"`.
- **`findPosition(boxes, unit, container, opts)`:** cerca la posizione per un collo. Prova le posizioni candidate (bordi dei colli già messi) e sceglie la più vicina al fondo (x minima), poi la più bassa (z), poi quella più a sinistra (y). Prova entrambe le rotazioni. Usa `restZ` (gravità) e `supportCheck` (regole di appoggio).
- **`packUnits` / `bestPack`:** provano 6 ordinamenti diversi (`STRATS`) e tengono il risultato migliore: meno volume fuori, poi minore lunghezza usata. Nel primo passaggio usano l'appoggio quasi pieno.
- **`autoPlan(units, containers, opts)`:** prova i container attivi dal più piccolo al più grande. Restituisce il primo dove entra tutto, con le note sul perché i più piccoli non bastano. Se nessuno basta, restituisce il migliore con la lista dei colli fuori.
- **`analyze(boxes, container, opts)`:** calcola il livello di ogni collo e gli errori: fuori dal container, troppo alto, porta, appoggio, sovrapposizione.
- **`moveBox(...)`:** serve per le modifiche manuali. I colli che erano sopra al collo spostato cadono per gravità, e il collo spostato si appoggia dove arriva.
- **`parseTable(matrix)`:** legge le tabelle incollate o i file Excel.
  - Riconosce i titoli delle colonne in italiano e inglese, i numeri con la virgola e le misure scritte come `120x80x100`.
  - Converte da metri o millimetri a cm.
  - Senza riga dei titoli, l'ordine delle colonne è: codice, L, W, H, peso, quantità, sovrapponibile. Se la prima cella è un numero, il codice manca e l'ordine diventa: L, W, H, peso, quantità, sovrapponibile.

### Interfaccia

- **Stato:** tutto è nell'oggetto `S` (righe, container, opzioni, piano, selezione).
- **Due passi:** "1. Colli" (tabella) e "2. Piano di carico" (riepilogo, vista dall'alto con trascinamento e filtro per livello, vista 3D o laterale, scheda del collo scelto, lista dei colli fuori).
- **Tastiera:** R ruota, le frecce spostano di 1 cm (con Maiusc 10 cm), Canc o Backspace toglie il collo, Esc annulla la selezione.

### Excel

- **Modello vuoto:** il tasto "Scarica modello Excel" crea i fogli `Colli` e `Istruzioni`.
- **Esportazione:** "Scarica Excel" crea i fogli `Colli`, `Piano` e `Riepilogo`.
- **Reimportazione:** se un file caricato ha il foglio `Piano`, il tool ricostruisce anche la disposizione salvata.
- **Funzione di salvataggio:** `saveXlsx(wb, name)` prima prova `window.claude.use('downloads')`, che esiste solo quando la pagina è aperta dentro claude.ai. Altrimenti usa un normale link di download con Blob, ed è questo che funziona su GitHub Pages. Il ramo `window.claude` può restare, non dà problemi.

## Come testare

- **Logica:** estrai il blocco CORE e provalo con Node (serve Node installato; su questa macchina al momento non c'è). Usa una cartella temporanea fuori dal repo:
  ```bash
  sed -n '/CORE-START/,/CORE-END/p' index.html > "$TMP/core.js"
  # aggiungi in fondo a core.js dei casi di prova, poi:
  node "$TMP/core.js"
  ```
  Casi utili:
  - 11 europallet 120×80 non sovrapponibili devono entrare in un 20'.
  - 22 europallet sovrapponibili alti 100 cm devono entrare in un 20'.
  - I piani automatici devono avere `analyze(...).errs.size === 0`.
- **Interfaccia:** apri `index.html` nel browser. Il tasto "Carica esempio" carica dati di prova.

## Limiti noti e possibili sviluppi

- **Soluzione non garantita ottimale:** l'algoritmo è euristico (il problema è "3D bin packing"). Trova soluzioni buone, non sempre la migliore.
- **Un solo container:** se il carico non entra nel container più grande, i colli restano nella lista "fuori". Sviluppo possibile: divisione su più container.
- **Peso sopra i colli:** non c'è un limite di peso caricabile sopra un collo. Il baricentro lungo la lunghezza è solo mostrato, non ottimizzato.
- **Colli sotto una sporgenza:** non si possono mettere colli sotto una parte sporgente di un collo già appoggiato.

## Regole per le modifiche

- **Lingua:** testi dell'interfaccia in italiano semplice, maiuscola solo a inizio frase.
- **File unico:** niente nuove dipendenze se non servono. Se servono, usa un CDN (cdnjs o jsdelivr) con versione fissa.
- **Comportamento:** non cambiare il sistema di coordinate o il formato dei fogli Excel senza mantenere la compatibilità con i file già salvati.
- **Test:** dopo ogni modifica alla logica, rifai i test con Node descritti sopra.
- **Commit:** non inserire mai la riga `Co-Authored-By` (né altre righe di attribuzione) nei messaggi di commit. Il messaggio deve avere al massimo 3 righe.
