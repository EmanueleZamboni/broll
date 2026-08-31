#!/usr/bin/env python3
"""Assembla la versione Artifact: un unico file HTML.

Prende il CSS e le foto della versione Cloudflare, ci mette dentro
artifact/app.js (che salva i punteggi nella pagina invece che su D1) e
scrive vacanza-cup.html. Le foto diventano data URI, così restano nella
pagina anche quando si ripubblica da sola.

    python3 artifact/build.py
"""
import base64, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PUBLIC = os.path.join(ROOT, 'public')
PLAYERS = ['Emanuele', 'Serena', 'Mario', 'Greta']

css = open(os.path.join(PUBLIC, 'style.css')).read()
app = open(os.path.join(HERE, 'app.js')).read()

avatars = []
for name in PLAYERS:
    path = os.path.join(PUBLIC, 'avatars', name.lower() + '.jpg')
    if not os.path.exists(path):
        continue
    b64 = base64.b64encode(open(path, 'rb').read()).decode()
    avatars.append(
        f'.col[data-name="{name}"] .avatar {{ color: transparent; '
        f'background-image: url(data:image/jpeg;base64,{b64}); '
        f'background-size: cover; background-position: center; }}'
    )

extra = """
/* ---------------------------------------- aggiunte della versione artifact */
.note { margin: 0 0 12px; padding: 9px 14px; border-radius: 14px; text-align: center;
  background: rgba(6,62,88,.62); color: #fff; font-size: .82rem; font-weight: 600;
  backdrop-filter: blur(4px); }
.note[hidden] { display: none; }
body.readonly .plus, body.readonly .minus { opacity: .45; filter: grayscale(.6); }

/* le foto profilo, incorporate nella pagina */
""" + '\n'.join(avatars) + '\n'

state = {'v': 0, 'points': {n: 0 for n in PLAYERS}, 'log': []}
S = 'scr' + 'ipt'
html = (
    '<title>Vacanza Cup</title>\n'
    '<style>\n' + css + extra + '</style>\n'
    '<div id="root"></div>\n'
    f'<{S} type="application/json" id="state">' + json.dumps(state) + f'</{S}>\n'
    f'<{S} id="app">\n' + app + f'\n</{S}>\n'
)
out = os.path.join(ROOT, 'vacanza-cup.html')
open(out, 'w').write(html)
print('scritto', out, len(html) // 1024, 'KB')
