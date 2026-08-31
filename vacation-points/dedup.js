const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 412, height: 915 } });
  const ts = Date.now();
  await p.addInitScript(([ts]) => {
    window.claude = { use: async (n) => n === 'artifact' ? { publish: async () => ({ version: 'x' }) } : null };
    // in coda: uno già arrivato (non va rimesso) e uno perso davvero (va rimesso)
    sessionStorage.setItem('vc_pending', JSON.stringify([
      { id: 'gia-arrivato', actor: 'Serena', target: 'Mario', delta: 1, ts },
      { id: 'perso-davvero', actor: 'Serena', target: 'Greta', delta: 1, ts },
    ]));
    localStorage.setItem('vc_who', 'Serena');
  }, [ts]);

  await p.goto('http://127.0.0.1:8900/dedup.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const punti = await p.$$eval('.col', cs => Object.fromEntries(cs.map(c => [c.dataset.name, c.querySelector('.score').textContent])));
  const coda = await p.evaluate(() => JSON.parse(sessionStorage.getItem('vc_pending') || '[]').map(e => e.id));
  console.log('punteggi:', JSON.stringify(punti));
  console.log('rimasti in coda:', JSON.stringify(coda));
  const ok = punti.Mario === '1' && punti.Greta === '1';
  console.log(ok ? 'OK — il punto già salvato non è stato contato due volte, quello perso è tornato'
                 : 'FALLITO');
  await b.close();
})();
