# Piano di carico container

Strumento web per preparare i piani di carico dei container. L'utente inserisce i colli (misure, peso, quantità, sovrapponibile sì/no). Il tool sceglie il container più piccolo che basta; se uno non basta, divide il carico sul minor numero di container (massimo 5) e propone fino a 3 soluzioni con riempimento simile. Calcola una disposizione e la mostra in modo grafico. L'utente può poi modificare la disposizione a mano.

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
5. **Limiti del container:** si controllano il peso massimo, l'altezza interna e le misure della porta (larghezza e altezza). Il calcolo automatico non supera mai il peso massimo: i colli in più passano al container successivo.
6. **Più container:** al massimo `maxCont` container (5 di default, da 1 a 5; con 1 si torna al comportamento a container singolo). Le soluzioni alternative devono riempire almeno `(1 - altGap/100)` del riempimento della migliore (`altGap` 10% di default). Entrambi in "Container e regole".
7. **Metodo di calcolo:** `opts.algo` = `'std'` (normale, `autoPlan`), `'cost'` (per costo, `autoPlanCost`) o `'both'` (confronto: prima la soluzione per costo, poi quelle normali, con i tempi nelle note). Si sceglie in "Container e regole". Ogni container ha `cost` (colonna "Costo"; 0 = non usarlo nel metodo per costo). I salvataggi vecchi senza `cost` prendono il valore del container di default con lo stesso nome, altrimenti 0.
8. **Container preferiti:** ogni container ha `pref` (casella "Preferito"; di default sì per 20' e 40' Standard, no per gli High Cube). A parità di numero di container si scelgono prima le combinazioni con meno container non preferiti, poi quelle con meno volume. Per escludere un tipo si toglie "Usa".

## Container di default (misure interne in cm)

| Nome | L | W | H | Porta L × H | Peso max kg | Preferito | Costo |
|---|---|---|---|---|---|---|---|
| 20' Standard | 589 | 235 | 239 | 234 × 228 | 28200 | sì | 1 |
| 40' Standard | 1203 | 235 | 239 | 234 × 228 | 26700 | sì | 1.8 |
| 40' High Cube | 1203 | 235 | 269 | 234 × 258 | 26500 | no | 1.98 |
| 45' High Cube | 1355 | 235 | 269 | 234 × 258 | 27600 | no | 0 |

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
- **`findPosition(boxes, unit, container, opts)`:** cerca la posizione per un collo. Prova le posizioni candidate (bordi dei colli già messi) e sceglie la più vicina al fondo (x minima), poi la più bassa (z), poi quella più a sinistra (y). Prova entrambe le rotazioni. Usa `restZ` (gravità) e `supportCheck` (regole di appoggio). Con `opts.place` cambia regola: `'up'` = a parità di x preferisce stare sopra un collo (risparmia pavimento); `'floor'` = prima la z più bassa in tutto il container, poi la x.
- **`packUnits` / `packOrder` / `bestPack`:** provano 6 ordinamenti diversi (`STRATS`) e tengono il risultato migliore: meno volume fuori, poi minore lunghezza usata. Nel primo passaggio usano l'appoggio quasi pieno. Un ordine già provato (stessa sequenza di colli uguali) non si rifà. Con `effort > 0`, se non entra tutto, `bestPack` prova anche le strategie con le regole `'up'` e `'floor'` e poi ordini con pesi casuali (`variedOrder`). I numeri casuali hanno un seme fisso (`rng`, `hashStr`): stesso carico, stessi tentativi. `packUnits` rispetta il peso massimo e salta i colli uguali a uno che non ha trovato posto (finché non si aggiunge un altro collo).
- **`packCombo(units, cis, containers, opts, cache, prune)`:** riempie i container nell'ordine dato; quello che non entra passa al successivo. `cache` riusa i risultati con stesso container e stessi colli rimasti. Con `prune` si ferma se il resto non può più entrare (volume o peso). Con più container, se resta fuori qualcosa, prova anche `packSplit`: divide ogni tipo di collo tra i container in proporzione al volume, poi mette i colli rimasti dove c'è posto. Tiene il risultato migliore (serve quando i colli finiti nel primo container avrebbero riempito gli spazi del secondo, es. pallet accanto alle macchine).
- **`autoPlan(units, containers, opts)`:** restituisce un **array di soluzioni** (la migliore per prima, al massimo 3) o `null` se nessun container è attivo. Lavora in due fasi:
  1. **Ricerca veloce:** prova le combinazioni da 1 a `maxCont` container in ordine di preferenza (meno container, meno non preferiti, meno volume) e scarta subito quelle impossibili per volume, peso o porta. Tiene la prima dove entra tutto.
  2. **Ricerca migliore:** fino a `TIME_LIMIT` ms dall'inizio (8000; `opts.timeLimit` lo cambia, i test usano 0 per la sola fase 1), riprova le combinazioni migliori di quella trovata dove restava fuori al massimo il 10% del volume. Fa giri con `EFFORT`, 5× e 20× tentativi. Il risultato può dipendere un po' dalla velocità del computer. Le alternative hanno lo stesso numero di container o uno in più, riempimento simile (`altGap`), nessun container vuoto, e non sono una versione "più grande in tutto" di una soluzione già trovata. Se niente basta, restituisce una sola soluzione con i colli fuori.
- **`autoPlanCost(units, containers, opts)`:** metodo "per costo" (nuovo, da confrontare con `autoPlan`, che resta). Usa solo i container con `cost > 0` (default: 20' = 1, 40' = 1.8, 40' HC = 1.98, 45' = 0 cioè escluso). Ordina tutte le combinazioni fino a `maxCont` per costo (poi meno container, poi meno volume), scarta quelle con volume, peso o porta insufficienti, e le prova una per volta per `STEP_TIME` ms (5000; `opts.stepTime`) con sempre più tentativi. Salta le combinazioni con container tutti uguali o più piccoli di una già fallita. Si ferma alla prima dove entra tutto, o dopo `COST_LIMIT` ms (60000; `opts.costLimit`). Restituisce una sola soluzione, con `method: 'cost'`.
- **`planCombo(units, cis, containers, opts)`:** piano con i tipi di container scelti a mano (tasto "Ricalcola").
- **Formato soluzione:** `{conts:[{ci, boxes}], unplaced, notes, fit, forced}`. I colli fuori sono comuni a tutti i container della soluzione.
- **`analyze(boxes, container, opts)`:** calcola il livello di ogni collo e gli errori: fuori dal container, troppo alto, porta, appoggio, sovrapposizione.
- **`moveBox(...)`:** serve per le modifiche manuali. I colli che erano sopra al collo spostato cadono per gravità, e il collo spostato si appoggia dove arriva.
- **`parseTable(matrix)`:** legge le tabelle incollate o i file Excel.
  - Riconosce i titoli delle colonne in italiano e inglese, i numeri con la virgola e le misure scritte come `120x80x100`.
  - Converte da metri o millimetri a cm.
  - Senza riga dei titoli, l'ordine delle colonne è: codice, L, W, H, peso, quantità, sovrapponibile. Se la prima cella è un numero, il codice manca e l'ordine diventa: L, W, H, peso, quantità, sovrapponibile.

### Interfaccia

- **Stato:** tutto è nell'oggetto `S`: righe, container, opzioni, `sols` (soluzioni), `si` (soluzione scelta), `plan` (= `sols[si]`), `cc` (container che si sta guardando), selezione. Usa `setSols()` per cambiarle, `cur()` per il container guardato (`{ci, boxes}`) e `cont()` per il suo tipo.
- **Salvataggio:** in `localStorage` si salvano `sols` e `si`. I salvataggi vecchi con `plan` (`{ci, boxes, ...}`) si convertono con `normPlan()`.
- **Due passi:** "1. Colli" (tabella) e "2. Piano di carico" (soluzioni proposte, schede dei container, riepilogo, vista dall'alto con trascinamento e filtro per livello, vista 3D o laterale, scheda del collo scelto, lista dei colli fuori).
- **Modifiche a mano tra container:** "Sposta nel container N" nella scheda del collo, "Aggiungi container", "Togli questo container" (i suoi colli vanno nella lista dei colli fuori). Cliccando un collo fuori, va nel container che si sta guardando.
- **Tastiera:** R ruota, le frecce spostano di 1 cm (con Maiusc 10 cm), Canc o Backspace toglie il collo, Esc annulla la selezione.

### Excel

- **Modello vuoto:** il tasto "Scarica modello Excel" crea i fogli `Colli` e `Istruzioni`.
- **Esportazione:** "Scarica Excel" crea i fogli `Colli`, `Piano` e `Riepilogo`. Nel foglio `Piano` l'ultima colonna (12ª) `Container` dice in quale container sta il collo (1, 2, ...). Nel `Riepilogo` le righe `Container`, `Container 2`, ... danno il tipo di ogni container; con più container segue una tabella per container.
- **Reimportazione:** se un file caricato ha il foglio `Piano`, il tool ricostruisce anche la disposizione salvata. I file vecchi, senza colonna `Container`, valgono come container 1.
- **Funzione di salvataggio:** `saveXlsx(wb, name)` prima prova `window.claude.use('downloads')`, che esiste solo quando la pagina è aperta dentro claude.ai. Altrimenti usa un normale link di download con Blob, ed è questo che funziona su GitHub Pages. Il ramo `window.claude` può restare, non dà problemi.

## Come testare

- **Logica:** `node test/core.test.js` (Node è installato in WSL: `wsl node test/core.test.js`). Il test legge il blocco CORE da `index.html` e controlla, tra l'altro:
  - 11 europallet 120×80 non sovrapponibili entrano in un 20'; 22 europallet sovrapponibili alti 100 cm entrano in un 20'.
  - Carichi grandi vanno su più container, senza errori, senza container vuoti e con ogni collo una volta sola.
  - Il peso massimo è rispettato; `maxCont` e `altGap` funzionano; al massimo 3 soluzioni.
  - I container preferiti vengono scelti prima; la ricerca migliore trova un container più piccolo della ricerca veloce, in meno di 10 s.
  - I piani automatici hanno `analyze(...).errs.size === 0` in ogni container.
  Aggiungi un caso a questo file per ogni nuova regola o correzione.
- **Confronto tra i metodi:** `wsl node test/compare.js` prova `autoPlan` e `autoPlanCost` su 13 carichi diversi e stampa container, costo, colli fuori e tempi (dura qualche minuto).
- **Interfaccia:** apri `index.html` nel browser. Il tasto "Carica esempio" carica dati di prova.

## Limiti noti e possibili sviluppi

- **Soluzione non garantita ottimale:** l'algoritmo è euristico (il problema è "3D bin packing"). Trova soluzioni buone, non sempre la migliore.
- **Più container:** si usa il riempimento goloso (ogni container il più pieno possibile) o la divisione proporzionale (`packSplit`), quello che lascia fuori meno. Con il metodo goloso l'ultimo container può essere poco pieno. Non c'è bilanciamento del peso tra container.
- **Tempi:** il calcolo dura al massimo circa 8-10 s (di solito molto meno). La pagina resta ferma durante il calcolo.
- **Peso sopra i colli:** non c'è un limite di peso caricabile sopra un collo. Il baricentro lungo la lunghezza è solo mostrato, non ottimizzato.
- **Colli sotto una sporgenza:** non si possono mettere colli sotto una parte sporgente di un collo già appoggiato.

## Regole per le modifiche

- **Lingua:** testi dell'interfaccia in italiano semplice, maiuscola solo a inizio frase.
- **File unico:** niente nuove dipendenze se non servono. Se servono, usa un CDN (cdnjs o jsdelivr) con versione fissa.
- **Comportamento:** non cambiare il sistema di coordinate o il formato dei fogli Excel senza mantenere la compatibilità con i file già salvati.
- **Test:** dopo ogni modifica alla logica, rifai i test con Node descritti sopra.
- **Versione:** la costante `APP_VERSION` (nel blocco interfaccia di `index.html`) si vede nel piè di pagina. Aggiornala a ogni rilascio: terzo numero per correzioni, secondo per nuove funzioni, primo per cambi che rompono la compatibilità (file Excel o dati salvati). 1.0.0 = container singolo, 1.1.0 = più container e soluzioni alternative, 1.2.0 = container preferiti e ricerca migliore, 1.3.0 = metodo per costo e confronto.
- **Esempio:** "Carica esempio" usa `SAMPLE`, pensato per dare 2 container nella soluzione migliore e un'alternativa con 3. Se cambi l'algoritmo, controlla che lo mostri ancora.
- **Commit:** non inserire mai la riga `Co-Authored-By` (né altre righe di attribuzione) nei messaggi di commit. Il messaggio deve avere al massimo 3 righe.
