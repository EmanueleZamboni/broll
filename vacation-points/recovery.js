const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 412, height: 915 } });

  // Finta capability: ogni salvataggio perde la gara contro un altro telefono.
  await p.addInitScript(() => {
    window.claude = { use: async (n) => n === 'artifact' ? {
      publish: async () => { const e = new Error('perso'); e.code = 'conflict'; throw e; }
    } : null };
  });

  await p.goto('http://127.0.0.1:8900/', { waitUntil: 'networkidle' });
  await p.click('.who:has-text("Serena")'); await p.click('#login-btn');
  await p.waitForSelector('#game:not([hidden])'); await p.waitForTimeout(600);

  for (let i = 0; i < 3; i++) { await p.click('.col[data-name="Mario"] .plus'); await p.waitForTimeout(160); }
  await p.waitForTimeout(2000);
  const prima = await p.$eval('.col[data-name="Mario"] .score', e => e.textContent);
  const inCoda = await p.evaluate(() => JSON.parse(sessionStorage.getItem('vc_pending') || '[]').length);
  console.log('prima della ricarica: Mario =', prima, '| punti messi da parte:', inCoda);

  // La pagina si ricarica sulla versione dell'altro, che quei punti non ce li ha.
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const dopo = await p.$eval('.col[data-name="Mario"] .score', e => e.textContent);
  const avviso = await p.evaluate(() => { const t = document.querySelector('.toast'); return t && !t.hidden ? t.textContent : '(nessuno)'; });
  console.log('dopo la ricarica:      Mario =', dopo, '| avviso:', avviso);
  console.log(dopo === '3' ? 'OK — i punti persi sono stati rimessi' : 'FALLITO — punti persi davvero');
  await b.close();
})();
