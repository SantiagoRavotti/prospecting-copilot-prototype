// End-to-end harness for the batch flow, driving the REAL desktop UI.
//
//   PC_FLOW=1 PC_FLOW_PHASE=1  → create campaign → prepare → package → import → review → edit → approve → re-import
//   PC_FLOW=1 PC_FLOW_PHASE=2  → (after a real app restart, same data dir) everything recovered; proposal applied
//
// Orchestrated by scripts/flow-e2e.cjs. Runs in a throwaway userData directory,
// never the user's real data. The "ChatGPT result" below is SIMULATED by this
// harness from the exported context package: it exercises the app, it is NOT
// research and never stands in for the user's real result.

const fs = require('node:fs');
const path = require('node:path');

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail: detail === undefined ? undefined : String(detail).slice(0, 300) });

// ---- renderer-side helpers (serialized into the page) ---------------------------------------
function installHelpers() {
  const h = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    q: (id) => document.querySelector('[data-testid="' + id + '"]'),
    all: (id) => Array.from(document.querySelectorAll('[data-testid="' + id + '"]')),
    async waitFor(fn, ms = 8000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try {
          const v = fn();
          if (v) return v;
        } catch (e) {
          /* keep waiting */
        }
        await h.sleep(60);
      }
      throw new Error('timeout: ' + fn.toString().slice(0, 140));
    },
    set(el, value) {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    async setId(id, value) {
      const el = await h.waitFor(() => h.q(id));
      h.set(el, value);
      await h.sleep(40);
    },
    async click(id, idx = 0) {
      const el = await h.waitFor(() => h.all(id)[idx]);
      el.click();
      await h.sleep(120);
    },
    async chooseFile(id, name, text) {
      const input = await h.waitFor(() => h.q(id));
      const dt = new DataTransfer();
      dt.items.add(new File([text], name, { type: 'application/json' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(300);
    },
    text: (id) => (h.q(id) ? h.q(id).innerText : null),
    esc: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  };
  window.__h = h;
  return true;
}

const run = (win, fn, arg) =>
  win.webContents.executeJavaScript(`(async () => { const h = window.__h; const arg = ${JSON.stringify(arg ?? null)}; return await (${fn.toString()})(h, arg); })()`);

// ---- simulated ChatGPT results (built from the exported package) -------------------------------
function simulatedResult(pkg, { variant }) {
  const base = {
    format: pkg.result_format.name,
    format_version: pkg.result_format.version,
    campaign_id: pkg.campaign_id,
    task_id: pkg.task_id,
    researched_at: new Date().toISOString(),
    linkedin_posts_accessible: false,
    limitations: ['SIMULADO por el arnés de pruebas: no es una investigación real.'],
  };
  const person = (n, extra = {}) => ({
    ref: 'sim-' + n,
    full_name: 'SIMULADO Persona ' + n,
    linkedin_url: 'https://www.linkedin.com/in/simulado-' + n + '/',
    title: 'Head of E-commerce',
    company: 'Empresa Simulada ' + n,
    location: 'Madrid, España',
    fit_reason: 'Candidato simulado para probar el flujo.',
    facts: [{ text: 'Hecho simulado ' + n, source_url: 'https://example.com/simulado-' + n }],
    posts: [],
    inferences: ['Suposición simulada ' + n],
    draft_message: 'Hola Persona ' + n + ', me gustaría conectar (texto simulado).',
    ...extra,
  });
  if (variant === 'three') {
    return JSON.stringify({ ...base, candidates: [person(1), person(2), person(3, { linkedin_url: null })] }, null, 2);
  }
  if (variant === 'v2') {
    return JSON.stringify(
      { ...base, candidates: [person(1, { draft_message: 'Otra versión simulada para Persona 1.' }), person(2), person(3, { linkedin_url: null })] },
      null,
      2,
    );
  }
  throw new Error('unknown variant');
}

// ---- phases -------------------------------------------------------------------------------------
async function phase1({ win, exportsDir, statePath }) {
  await run(win, installHelpers);

  // 1. Create the campaign (all brief fields) through the UI.
  const created = await run(win, async (h) => {
    location.hash = '#/campaigns';
    await h.sleep(500);
    await h.click('campaign-new');
    await h.setId('campaign-name', 'Flujo e2e simulado');
    await h.setId('campaign-objective', 'Networking con responsables de e-commerce');
    await h.setId('campaign-audience', 'Head of E-commerce');
    await h.setId('campaign-criteria', 'España, retail online');
    await h.setId('campaign-exclusions', 'Competidores\nAgencias');
    await h.setId('campaign-target', '3');
    await h.setId('campaign-guidelines', 'Cercano, sin vender.');
    await h.setId('campaign-examples', 'Hola Ana, vi tu charla sobre marketplaces…');
    await h.click('campaign-save');
    await h.waitFor(() => h.all('campaign-item').length === 1);
    return { items: h.all('campaign-item').length, fichas: h.all('ficha').length };
  });
  check('campaña creada desde la UI', created.items === 1 && created.fichas === 0);

  // 2. Prepare the research: package + directive. Nothing is sent anywhere.
  const prepared = await run(win, async (h) => {
    await h.setId('prepare-instruction', 'Priorizá gente que publique sobre marketplaces');
    await h.click('prepare-btn');
    await h.waitFor(() => h.q('prepared-panel'));
    await h.click('package-download');
    await h.click('example-download');
    await h.click('directive-copy');
    const details = h.q('prepared-panel').querySelector('details');
    details.open = true;
    return { directive: h.q('directive-text').textContent, panel: h.q('prepared-panel').innerText };
  });
  check('la directiva generada incluye ids, formato, reglas y esquema', /research-result/.test(prepared.directive) && /No completes registros ficticios/.test(prepared.directive) && /JSON Schema/.test(prepared.directive) && /task_id/.test(prepared.directive));
  check('la UI aclara que todavía no se investigó nada', /Todavía no se investigó nada/.test(prepared.panel));
  await new Promise((r) => setTimeout(r, 600));
  const files = fs.readdirSync(exportsDir);
  const pkgFile = files.find((f) => f.startsWith('contexto-') && f.endsWith('.json'));
  check('el paquete de contexto se guardó como archivo', Boolean(pkgFile), files.join(', '));
  check('se guardó también el ejemplo de resultado', files.some((f) => f.startsWith('ejemplo-resultado-')));
  const pkg = JSON.parse(fs.readFileSync(path.join(exportsDir, pkgFile), 'utf8'));
  check('el paquete trae formato, versión, campaña, tarea, estilo y esquema', pkg.format === 'prospecting-copilot/research-context' && pkg.format_version === 1 && pkg.campaign_id && pkg.task_id && pkg.style.saved_examples.length === 1 && pkg.campaign.exclusions.length === 2 && pkg.result_format.json_schema && pkg.result_format.example);
  check('el paquete incluye el estilo y las instrucciones guardadas', pkg.style.guidelines === 'Cercano, sin vender.' && pkg.request.instruction_from_user.includes('marketplaces'));
  const shownDirective = prepared.directive;
  check('la directiva menciona el archivo del paquete', shownDirective.includes(pkgFile));

  // 3. Format errors: text is kept when the dialog is closed and reopened.
  const bad = '{ "format": "x", "candidates": [ {"full_name": "A" "fit_reason": "B"} ] }';
  const badRun = await run(win, async (h, text) => {
    await h.click('import-open');
    await h.setId('import-text', text);
    await h.click('import-review');
    await h.waitFor(() => h.q('import-fatal'));
    const fatal = h.q('import-fatal').innerText;
    const canConfirm = Boolean(h.q('import-confirm'));
    h.esc();
    await h.waitFor(() => !h.q('import-dialog'));
    await h.click('import-open');
    const kept = h.q('import-text').value;
    await h.setId('import-text', '');
    h.esc();
    await h.waitFor(() => !h.q('import-dialog'));
    return { fatal, canConfirm, kept };
  }, bad);
  check('JSON inválido: error concreto con línea/columna y sin botón de importar', /No es JSON válido/.test(badRun.fatal) && !badRun.canConfirm, badRun.fatal);
  check('el texto pegado se conserva al cerrar y reabrir el diálogo', badRun.kept === bad);

  // 4. Valid import (simulated ChatGPT answer), by paste.
  const three = simulatedResult(pkg, { variant: 'three' });
  const imp = await run(win, async (h, text) => {
    await h.click('import-open');
    await h.setId('import-text', text);
    await h.click('import-review');
    await h.waitFor(() => h.q('import-preview'));
    const counts = h.q('import-counts').innerText;
    const warnings = h.q('import-preview').innerText;
    await h.click('import-confirm');
    await h.waitFor(() => h.all('ficha').length === 3);
    return { counts, warnings, names: h.all('ficha').map((f) => f.dataset.name), origins: h.all('ficha-origin').length, incomplete: h.all('ficha-incomplete').length };
  }, three);
  check('vista previa: 3 nuevas', /3 nuevas · 0 actualizadas/.test(imp.counts), imp.counts);
  check('vista previa avisa de la ficha sin URL y de las limitaciones', /Sin URL de LinkedIn/.test(imp.warnings) && /NO pudo leer publicaciones/.test(imp.warnings));
  check('se crearon 3 fichas con origen "Investigación importada de ChatGPT"', imp.names.length === 3 && imp.origins === 3);
  check('la ficha sin URL aparece como incompleta', imp.incomplete === 1);

  // 5. Review: edit + approve #1, discard #2, #3 is blocked until the URL is completed.
  const review = await run(win, async (h) => {
    await h.click('ficha-open', 0);
    await h.setId('message-textarea', 'Mi versión editada para Persona 1.');
    await h.click('save-message');
    await h.click('ficha-approve');
    await h.waitFor(() => h.all('ficha')[0].dataset.approval === 'approved');
    await h.click('ficha-open', 0); // close #1
    await h.click('ficha-open', 1);
    await h.click('ficha-discard');
    await h.waitFor(() => h.all('ficha')[1].dataset.approval === 'discarded');
    await h.click('ficha-open', 1); // close #2
    await h.click('ficha-open', 2);
    const blocked = h.q('ficha-blocked') ? h.q('ficha-blocked').innerText : null;
    const approveDisabled = h.q('ficha-approve').disabled;
    await h.setId('ficha-url-input', 'https://example.com/no-es-linkedin');
    await h.click('ficha-url-save');
    await h.sleep(200);
    const stillBlocked = Boolean(h.q('ficha-url-input'));
    await h.setId('ficha-url-input', 'https://www.linkedin.com/in/simulado-3-completada/');
    await h.click('ficha-url-save');
    await h.waitFor(() => !h.q('ficha-url-input'));
    const approveEnabled = !h.q('ficha-approve').disabled;
    await h.click('ficha-open', 2); // close #3 (left pending on purpose)
    return { blocked, approveDisabled, stillBlocked, approveEnabled, statuses: h.all('ficha').map((f) => f.dataset.approval) };
  });
  check('editar + aprobar la ficha 1; descartar la 2', review.statuses[0] === 'approved' && review.statuses[1] === 'discarded', review.statuses.join(','));
  check('ficha incompleta: aprobar bloqueado con motivo', review.approveDisabled && /URL de LinkedIn/.test(review.blocked || ''), review.blocked);
  check('URL que no es de LinkedIn es rechazada', review.stillBlocked);
  check('al completar la URL se habilita aprobar', review.approveEnabled);

  // 6. Re-import the same result, now through the FILE input: nothing is duplicated.
  const again = await run(win, async (h, text) => {
    await h.click('import-open');
    await h.chooseFile('import-file', 'resultado-chatgpt.json', text);
    await h.waitFor(() => h.q('import-preview'));
    const counts = h.q('import-counts').innerText;
    const global = h.q('import-global-warnings') ? h.q('import-global-warnings').innerText : '';
    const confirmText = h.q('import-confirm').innerText;
    const disabled = h.q('import-confirm').disabled;
    h.esc();
    await h.waitFor(() => !h.q('import-dialog'));
    return { counts, global, confirmText, disabled, fichas: h.all('ficha').length };
  }, three);
  check('reimportar el mismo resultado: 0 nuevas, 3 sin cambios, nada que confirmar', /0 nuevas · 0 actualizadas · 3 sin cambios/.test(again.counts) && again.disabled, again.counts + ' | ' + again.confirmText);
  check('la vista previa avisa que ya fue importado', /ya se importó/.test(again.global));
  check('no se duplicaron fichas', again.fichas === 3);

  // 7. A new ChatGPT version of ficha 1's message: becomes a PROPOSAL; edit + approval stay.
  const v2 = simulatedResult(pkg, { variant: 'v2' });
  const prop = await run(win, async (h, text) => {
    await h.click('import-open');
    await h.setId('import-text', text);
    await h.click('import-review');
    await h.waitFor(() => h.q('import-preview'));
    const counts = h.q('import-counts').innerText;
    await h.click('import-confirm');
    await h.waitFor(() => h.all('ficha-has-proposal').length === 1);
    await h.click('ficha-open', 0);
    const proposals = h.all('proposal').length;
    const editorText = h.q('message-textarea').value;
    const status = h.all('ficha')[0].dataset.approval;
    await h.click('ficha-open', 0);
    return { counts, proposals, editorText, status, fichas: h.all('ficha').length };
  }, v2);
  check('nueva versión: 1 actualizada (propuesta), sin fichas nuevas', /0 nuevas · 1 actualizadas · 2 sin cambios/.test(prop.counts) && prop.fichas === 3, prop.counts);
  check('la propuesta no pisó mi texto editado ni la aprobación', prop.editorText === 'Mi versión editada para Persona 1.' && prop.status === 'approved' && prop.proposals === 1);

  await new Promise((r) => setTimeout(r, 1200)); // let the last persist reach disk
  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  check('el archivo de datos en disco tiene las fichas, la importación y la aprobación', saved.prospects.length === 3 && saved.importHistory.length === 2 && saved.prospects.filter((p) => p.approval && p.approval.status === 'approved').length === 1);
  return { campaignId: pkg.campaign_id };
}

async function phase2({ win, statePath }) {
  await run(win, installHelpers);
  const back = await run(win, async (h) => {
    location.hash = '#/campaigns';
    await h.waitFor(() => h.all('ficha').length === 3, 10000);
    return {
      version: h.q('app-version').innerText,
      statuses: h.all('ficha').map((f) => f.dataset.approval),
      names: h.all('ficha').map((f) => f.dataset.name),
      proposalBadge: h.all('ficha-has-proposal').length,
      history: h.q('import-history') ? h.q('import-history').innerText : '',
      tasks: h.all('research-task').map((t) => t.innerText).join(' || '),
    };
  });
  check('tras reiniciar: las 3 fichas siguen ahí', back.names.length === 3, back.names.join(', '));
  check('tras reiniciar: aprobada / descartada / pendiente se conservan', back.statuses.join(',') === 'approved,discarded,pending', back.statuses.join(','));
  check('tras reiniciar: la propuesta de ChatGPT sigue pendiente', back.proposalBadge === 1);
  check('tras reiniciar: historial de importaciones y tarea importada', /2 duplicadas|0 duplicadas/.test(back.history) && /Resultado importado/.test(back.tasks), back.history);
  check('la versión se ve dentro de la app', /v\d+\.\d+\.\d+/.test(back.version), back.version);

  // The user explicitly applies the proposal: text changes, approval is invalidated, history keeps the old text.
  const applied = await run(win, async (h) => {
    await h.click('ficha-open', 0);
    await h.click('proposal-apply');
    await h.waitFor(() => h.all('ficha')[0].dataset.approval === 'pending');
    const text = h.q('message-textarea').value;
    const historyLabel = h.q('ficha-history') ? h.q('ficha-history').innerText : '';
    return { text, historyLabel, status: h.all('ficha')[0].dataset.approval };
  });
  check('aplicar la propuesta cambia el texto y vuelve la ficha a pendiente', applied.text === 'Otra versión simulada para Persona 1.' && applied.status === 'pending', applied.text);
  check('queda la versión anterior en el historial', /Versiones anteriores \(2\)/.test(applied.historyLabel), applied.historyLabel);

  // Re-approve and make sure it survives (explicit user action).
  await run(win, async (h) => {
    await h.click('ficha-approve');
    await h.waitFor(() => h.all('ficha')[0].dataset.approval === 'approved');
    return true;
  });
  await new Promise((r) => setTimeout(r, 1200));
  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const first = saved.prospects.find((p) => p.research && p.research.importKey && p.research.importKey.endsWith('#ref:sim-1'));
  check('en disco: aprobación = copia exacta del texto nuevo', first && first.approval.status === 'approved' && first.approval.approvedText === 'Otra versión simulada para Persona 1.');
  check('en disco: sin claves ni tokens en el estado', !/sk-ant|sk-proj|BEGIN PRIVATE/.test(JSON.stringify(saved)));
}

async function runFlow({ app, createWindow, dataDir }) {
  const phaseNo = process.env.PC_FLOW_PHASE === '2' ? 2 : 1;
  const exportsDir = process.env.PC_AUTOSAVE_DIR;
  const statePath = path.join(dataDir(), 'state.json');
  const win = createWindow();
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) console.log('RENDERER_ERROR ' + message.slice(0, 300));
  });
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      if (phaseNo === 1) await phase1({ win, exportsDir, statePath });
      else await phase2({ win, statePath });
    } catch (e) {
      check('el arnés terminó sin excepciones', false, e && e.message);
    }
    const ok = checks.every((c) => c.pass);
    console.log('FLOW_RESULT ' + JSON.stringify({ phase: phaseNo, ok, checks }));
    app.exit(ok ? 0 : 1);
  });
}

module.exports = { runFlow };
