# 👑 Vacanza Cup — Lido degli Estensi

Segnapunti da vacanza per **Emanuele, Serena, Mario e Greta**.
Una barra verticale a testa (stile schermata dei risultati di *Super Mario 3D
World*), la corona a chi è in testa, un tasto **+** e un tasto **−** per ognuno.

Gira su **Cloudflare Workers + D1**: nessun server da gestire, sempre online,
e con questi numeri sta ampiamente dentro il piano gratuito.

È pensato **per il telefono**: su schermo grande resta una colonna centrata
della larghezza di un cellulare.

---

## Com'è fatto

| | |
|---|---|
| `src/index.js` | Il Worker: login, API dei punti, serve il sito |
| `public/` | Il sito: `index.html`, `style.css`, `app.js` |
| `public/avatars/` | Le foto profilo (vedi il README lì dentro) |
| `schema.sql` | La tabella `events`, l'unica che c'è |
| `wrangler.toml` | Configurazione Cloudflare |

I punteggi stanno su **D1** (il database SQLite di Cloudflare), quindi sono gli
stessi per tutti e sopravvivono a chiusure e riavvii. Ogni telefono ricontrolla
il punteggio ogni 2,5 secondi: se Serena dà un punto a Mario, lo vedi comparire
anche tu.

## Come sono tenuti i punti (perché non si perdono)

Da nessuna parte esiste un "totale" che viene sovrascritto. Esiste **un registro
in cui si può soltanto aggiungere una riga**: *+1 a Greta*, *−1 a Mario*, e così
via. Il punteggio è la somma di quelle righe, ricalcolata a ogni lettura.

Cosa ci si guadagna:

- **Due telefoni che segnano nello stesso istante non si sovrascrivono.** Nessuno
  legge il totale, lo cambia e lo riscrive: si accodano due righe e finisce lì.
  Provato: 20 richieste in parallelo, 20 punti, nessuno perso.
- **Un totale non può restare sbagliato.** Non essendo memorizzato, si ricalcola
  ogni volta dallo storico.
- **"Azzera tutto" non cancella niente.** Scrive una riga di tipo `reset` e la
  somma riparte da lì. Tutto quello che è successo prima resta nel registro.
- **Si può scaricare tutto** aprendo `/api/export` da dentro l'app (da loggati):
  restituisce l'intero registro in JSON, azzeramenti compresi. Non c'è un tasto
  apposta, per non appesantire la schermata.

Sotto c'è comunque la rete di Cloudflare: D1 tiene i dati replicati e ha il
**Time Travel**, che permette di riportare il database a un qualsiasi istante
degli ultimi 30 giorni (`npx wrangler d1 time-travel restore vacanza-cup
--timestamp=...`).

## Come si usa

1. Apri il sito, scegli chi sei e digita il **codice vacanza** (uno solo, uguale
   per tutti — niente password da ricordare). Resti dentro per 60 giorni.
2. **+** dà un punto, **−** lo toglie. Puoi darli a chiunque, anche a te stesso.
3. Chi è primo si prende la corona. In caso di pari merito la corona sparisce.
4. **Annulla ultimo** rimedia all'errore appena fatto (scrive il punto opposto).
   **Azzera tutto** fa ripartire la classifica da zero senza cancellare lo
   storico (richiede il codice vacanza).
5. 🔊 accende e spegne i suoni.

## Metterlo online dal telefono (senza installare niente)

Nel repo c'è `.github/workflows/deploy-vacanza-cup.yml`: fa tutto GitHub.

1. Su **dash.cloudflare.com** → *My Profile → API Tokens → Create Token*.
   Parti dal modello **Edit Cloudflare Workers** e assicurati che fra i permessi
   ci sia anche **D1 → Edit** (aggiungilo se manca). Copia il token.
2. Su GitHub, nel repo: *Settings → Secrets and variables → Actions →
   New repository secret*, e aggiungi:
   - `CLOUDFLARE_API_TOKEN` — il token appena creato (obbligatorio)
   - `CLOUDFLARE_ACCOUNT_ID` — l'Account ID, se hai più di un account Cloudflare
   - `ROOM_CODE` — il codice per entrare (se manca resta `vacanza`)
   - `AUTH_SECRET` — una stringa lunga a caso, per firmare le sessioni
3. *Actions → Deploy Vacanza Cup → Run workflow*.

Il workflow crea il database se non c'è, ci mette lo schema, fa il deploy e
scrive il link nel riepilogo del run. Senza token non fallisce: dice cosa manca.

## Oppure dal computer (una volta sola, ~5 minuti)

Serve un account Cloudflare gratuito e Node installato.

```bash
cd vacation-points
npm install

# 1) login su Cloudflare
npx wrangler login

# 2) crea il database e incolla l'id che ti stampa dentro wrangler.toml,
#    al posto di INCOLLA_QUI_L_ID_DEL_TUO_D1
npx wrangler d1 create vacanza-cup

# 3) crea le tabelle
npx wrangler d1 execute vacanza-cup --remote --file=./schema.sql

# 4) scegli il codice vacanza (meglio come secret che dentro wrangler.toml)
npx wrangler secret put ROOM_CODE

# 5) e un segreto per firmare le sessioni (una stringa lunga a caso)
npx wrangler secret put AUTH_SECRET

# 6) online
npx wrangler deploy
```

Alla fine Wrangler stampa l'indirizzo
(`https://vacanza-cup.<tuo-nome>.workers.dev`): quello è il link da mandare agli
altri tre.

### Provarlo sul tuo computer

```bash
npx wrangler dev
# poi apri http://localhost:8787 — il codice vacanza è "vacanza"
```

In locale il database è una copia finta sul tuo computer: i punti che dai qui
non toccano quelli veri.

## Le foto profilo

Metti in `public/avatars/` quattro immagini quadrate chiamate `emanuele.jpg`,
`serena.jpg`, `mario.jpg`, `greta.jpg` (vanno bene anche `.png`), poi rifai
`npx wrangler deploy`. Se una foto manca compare l'iniziale del nome.

## Cambiare i nomi

I nomi stanno in due punti e devono restare uguali:

- `src/index.js` → `const PLAYERS = [...]`
- `public/app.js` → `const PLAYERS = [...]` e `const COLORS = {...}`

Cambiare un nome non fa sparire i punti già assegnati: restano nel registro
intestati al nome vecchio, quindi conviene farlo prima di cominciare.

## Sicurezza, in due righe

Il codice vacanza è un lucchetto da spiaggia, non una cassaforte: chiunque lo
abbia può entrare e scegliere di essere chiunque. Per un segnapunti tra amici va
benissimo. Non metterci dentro niente di serio.
