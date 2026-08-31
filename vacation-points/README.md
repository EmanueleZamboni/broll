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
| `schema.sql` | Le due tabelle: `players` e `events` |
| `wrangler.toml` | Configurazione Cloudflare |

I punteggi stanno su **D1** (il database SQLite di Cloudflare), quindi sono gli
stessi per tutti e sopravvivono a chiusure e riavvii. Ogni telefono ricontrolla
il punteggio ogni 2,5 secondi: se Serena dà un punto a Mario, lo vedi comparire
anche tu.

## Come si usa

1. Apri il sito, scegli chi sei e digita il **codice vacanza** (uno solo, uguale
   per tutti — niente password da ricordare). Resti dentro per 60 giorni.
2. **+** dà un punto, **−** lo toglie. Puoi darli a chiunque, anche a te stesso.
3. Chi è primo si prende la corona. In caso di pari merito la corona sparisce.
4. **Annulla ultimo** rimedia all'errore appena fatto.
   **Azzera tutto** riporta tutti a zero (richiede il codice vacanza).
5. 🔊 accende e spegne i suoni.

## Metterlo online (una volta sola, ~5 minuti)

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

## Sicurezza, in due righe

Il codice vacanza è un lucchetto da spiaggia, non una cassaforte: chiunque lo
abbia può entrare e scegliere di essere chiunque. Per un segnapunti tra amici va
benissimo. Non metterci dentro niente di serio.
