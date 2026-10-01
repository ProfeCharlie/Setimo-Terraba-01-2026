/* Registro de identidad y recepción privada de resultados para Educación Abierta. */
(() => {
  'use strict';
  const exam = document.currentScript.dataset.exam;
  const api = 'https://script.google.com/macros/s/AKfycbwtRGWJPNc8n413pPLvQE5ntBUFfJeG2qKJVxhhNG9CM8tlxqXb-j07anfudEV7Zz0y/exec';
  const storage = `registro_${exam}_v1`;
  const startButton = document.getElementById('startBtn');
  const view = document.getElementById('startView');
  let registration;
  try { registration = JSON.parse(localStorage.getItem(storage) || 'null'); } catch (_) {}
  const inProgress = exam === 'noveno' ? deadline !== null : started;
  if (!inProgress && !finished) { registration = null; localStorage.removeItem(storage); }

  const box = document.createElement('div');
  box.style.cssText = 'max-width:470px;margin:18px auto;padding:20px;background:#fff;border:1px solid #d3dce8;border-radius:12px;box-shadow:0 2px 10px #0000000b';
  box.innerHTML = '<label for="studentFirst" style="display:block;font-weight:700;margin:0 0 5px">Nombre</label>' +
    '<input id="studentFirst" autocomplete="given-name" maxlength="70" required style="box-sizing:border-box;width:100%;padding:12px;margin:0 0 13px;border:1px solid #94a3b8;border-radius:7px;font:inherit">' +
    '<label for="studentLast" style="display:block;font-weight:700;margin:0 0 5px">Apellidos</label>' +
    '<input id="studentLast" autocomplete="family-name" maxlength="70" required style="box-sizing:border-box;width:100%;padding:12px;border:1px solid #94a3b8;border-radius:7px;font:inherit">' +
    '<p id="registrationStatus" role="status" style="margin:12px 0 0;font-size:.94rem"></p>' +
    '<button id="retryRegistration" type="button" style="display:none;margin-top:10px">Reintentar conexión</button>';
  startButton.parentElement.before(box);
  const first = box.querySelector('#studentFirst'), last = box.querySelector('#studentLast');
  const status = box.querySelector('#registrationStatus');
  const retry = box.querySelector('#retryRegistration');
  if (registration) { first.value = registration.firstName || ''; last.value = registration.lastName || ''; }
  startButton.disabled = true;
  status.textContent = 'Consultando disponibilidad de la prueba…';
  let open = false, busy = false, checking = false;

  function jsonp(op, id) {
    return new Promise((resolve, reject) => {
      const callback = 'examStatus_' + Math.random().toString(36).slice(2, 14);
      const script = document.createElement('script');
      const timer = setTimeout(() => done(new Error('No se pudo conectar con el registro. Inténtalo de nuevo.')), 12000);
      function done(error, data) {
        clearTimeout(timer); script.remove(); delete window[callback];
        error ? reject(error) : resolve(data);
      }
      window[callback] = data => done(null, data);
      script.onerror = () => done(new Error('No se pudo conectar con el registro. Inténtalo de nuevo.'));
      script.src = `${api}?exam=${encodeURIComponent(exam)}&op=${op}&callback=${callback}` +
        (id ? `&id=${encodeURIComponent(id)}` : '') + `&_=${Date.now()}`;
      document.head.append(script);
    });
  }
  async function check() {
    if (checking) return;
    checking = true;
    open = false;
    retry.style.display = 'none';
    startButton.disabled = true;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        status.textContent = attempt ? `Reintentando conexión (${attempt + 1}/3)…` : 'Consultando disponibilidad de la prueba…';
        try {
          const state = await jsonp('status');
          open = !!state.open;
          status.textContent = state.message || (open ? 'Prueba disponible.' : 'Prueba cerrada.');
          startButton.disabled = !open;
          return;
        } catch (err) {
          if (attempt === 2) throw err;
          await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
        }
      }
    } catch (err) { status.textContent = err.message; retry.style.display = 'inline-block'; }
    finally { checking = false; }
  }
  retry.onclick = check;
  check();
  const originalStart = window.start;
  window.start = async function (...args) {
    if (busy || !open) return;
    const firstName = first.value.trim(), lastName = last.value.trim();
    const valid = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñÀ-ÿ' .-]{2,70}$/;
    if (!valid.test(firstName)) { first.focus(); status.textContent = 'Escribe tu nombre (al menos dos caracteres).'; return; }
    if (!valid.test(lastName)) { last.focus(); status.textContent = 'Escribe tus apellidos (al menos dos caracteres).'; return; }
    busy = true; startButton.disabled = true; status.textContent = 'Registrando el inicio…';
    try {
      const id = crypto.randomUUID();
      const state = await jsonp('start', id);
      if (!state.open || !state.ticket) throw new Error(state.message || 'No se pudo iniciar la prueba.');
      registration = {attemptId: id, ticket: state.ticket, firstName, lastName, saved: false};
      localStorage.setItem(storage, JSON.stringify(registration));
      originalStart.apply(this, args);
    } catch (err) { status.textContent = err.message; startButton.disabled = !open; }
    finally { busy = false; }
  };
  startButton.onclick = (...args) => window.start(...args);

  function showSave(message) {
    const result = document.getElementById('resultView');
    let note = document.getElementById('privateSaveStatus');
    if (!note) { note = document.createElement('p'); note.id = 'privateSaveStatus'; note.setAttribute('role', 'status'); result.append(note); }
    note.textContent = message;
    note.hidden = !message;
  }
  let sending = false;
  function send() {
    if (!finished || !registration || registration.saved || sending) return;
    sending = true;
    showSave('Guardando tu resultado…');
    const nonce = crypto.randomUUID();
    const frame = document.createElement('iframe');
    frame.name = `save_${nonce}`;
    frame.style.display = 'none';
    document.body.append(frame);
    const form = document.createElement('form');
    form.method = 'POST'; form.action = `${api}?exam=${encodeURIComponent(exam)}`;
    form.target = frame.name; form.style.display = 'none';
    const data = {attemptId: registration.attemptId, ticket: registration.ticket,
      firstName: registration.firstName, lastName: registration.lastName,
      answers: Array.from(answers), timedOut: !!timedOut};
    for (const [key, value] of Object.entries({nonce, payload: JSON.stringify(data)})) {
      const input = document.createElement('input'); input.type = 'hidden';
      input.name = key; input.value = value; form.append(input);
    }
    document.body.append(form);
    const timer = setTimeout(() => done(false, 'No se confirmó el registro del resultado.'), 16000);
    function done(ok, message) {
      clearTimeout(timer); window.removeEventListener('message', onMessage);
      form.remove(); frame.remove(); sending = false;
      if (ok) {
        registration.saved = true;
        localStorage.setItem(storage, JSON.stringify(registration));
        showSave('');
      } else {
        showSave((message || 'Error al guardar.') + ' Pulsa «Reintentar envío».');
        let retry = document.getElementById('retryPrivateSave');
        if (!retry) { retry = document.createElement('button'); retry.id = 'retryPrivateSave';
          retry.type = 'button'; retry.textContent = 'Reintentar envío';
          document.getElementById('resultView').append(retry); retry.onclick = send; }
      }
    }
    function onMessage(event) {
      const data = event.data;
      if (!/^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+[.-]script\.googleusercontent\.com)$/.test(event.origin)) return;
      if (!data || data.kind !== 'educacion-abierta-exam-save' || data.nonce !== nonce) return;
      if (data.status === 'ok' || data.status === 'duplicate') done(true);
      else done(false, data.message);
    }
    window.addEventListener('message', onMessage);
    form.submit();
  }
  const originalFinish = window.finish;
  window.finish = function (...args) { const result = originalFinish.apply(this, args); if (finished) send(); return result; };
  const restartButton = document.getElementById(exam === 'setimo' || exam === 'noveno' ? 'confirmRestartBtn' : 'restartBtn');
  restartButton.addEventListener('click', () => setTimeout(() => {
    const reset = exam === 'noveno' ? deadline === null : !started && !finished;
    if (reset) { registration = null; localStorage.removeItem(storage); first.value = ''; last.value = ''; check(); }
  }, 0));
  if (finished) send();
})();
