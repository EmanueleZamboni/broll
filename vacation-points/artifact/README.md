# Versione Artifact (un file solo)

Stessa app, ma senza Cloudflare: è una pagina sola che salva i punteggi
**dentro di sé**, ripubblicandosi tramite la capability `artifact` di
claude.ai. Serve per avere un link subito, senza deploy.

```bash
python3 artifact/build.py     # produce vacanza-cup.html
```

Differenze rispetto alla versione Worker:

- niente codice vacanza: chi apre il link sceglie solo chi è;
- i punti li può assegnare solo chi ha accesso **in modifica** alla pagina;
  chi ha il link in sola lettura vede i punteggi e basta;
- se due persone segnano un punto nello stesso istante, una delle due
  modifiche si perde (vince chi salva per primo, gli altri si ricaricano);
- le foto profilo sono incorporate nella pagina come data URI.

Per una vacanza in quattro con tutti che segnano punti, la versione
Cloudflare del README principale resta quella giusta.
