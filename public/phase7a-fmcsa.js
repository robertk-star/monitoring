(function () {
  function text(el) { return (el && el.textContent ? el.textContent : '').trim(); }
  function getRows() { return Array.from(document.querySelectorAll('table tbody tr')).filter((row) => row.querySelectorAll('td').length >= 8); }
  function getCells(row) { return Array.from(row.querySelectorAll('td')); }
  function getCompanyId() { const select = document.querySelector('.company-switcher select'); return select && select.value ? select.value : '1'; }
  function rowFileNumber(row) { const cell = getCells(row)[0]; return text(cell).replace(/[^0-9A-Za-z\-_.]/g, ''); }
  function toast(message, danger) {
    let box = document.getElementById('phase7a-toast');
    if (!box) { box = document.createElement('div'); box.id = 'phase7a-toast'; document.body.appendChild(box); }
    box.className = danger ? 'phase7a-toast danger' : 'phase7a-toast';
    box.textContent = message;
    clearTimeout(box.__hideTimer);
    box.__hideTimer = setTimeout(() => box.remove(), 6500);
  }
  async function downloadFmcsaPdf(row) {
    const fileNumber = rowFileNumber(row);
    if (!fileNumber) return toast('Could not read file number for this row.', true);
    const button = row.querySelector('.phase7a-fmcsa');
    const oldText = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Building PDF...'; }
    try {
      const response = await fetch('/api/fmcsa-packet', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: getCompanyId(), fileNumber })
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        let message = `Request failed: ${response.status}`;
        if (contentType.includes('application/json')) {
          const data = await response.json().catch(() => null);
          if (data && data.message) message = data.message;
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fmcsa-safety-performance-${fileNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      row.classList.add('phase7a-built-row');
      setTimeout(() => row.classList.remove('phase7a-built-row'), 2500);
      toast('FMCSA mapped PDF downloaded.');
    } catch (error) {
      toast(error.message || 'Could not generate FMCSA PDF.', true);
    } finally {
      if (button) { button.disabled = false; button.textContent = oldText || 'FMCSA PDF'; }
    }
  }
  function addButtons() {
    getRows().forEach((row) => {
      const cells = getCells(row);
      if (!cells[7] || cells[7].querySelector('.phase7a-fmcsa')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'phase7a-fmcsa';
      button.textContent = 'FMCSA PDF';
      button.addEventListener('click', () => downloadFmcsaPdf(row));
      cells[7].appendChild(button);
    });
  }
  function addPanel() {
    const safetyHeader = Array.from(document.querySelectorAll('.page-header h1')).find((h) => text(h) === 'Safety Performance Reports');
    if (!safetyHeader || document.getElementById('phase7a-panel')) return;
    const after = document.getElementById('phase7-panel') || document.getElementById('phase6-panel') || document.getElementById('phase5a-panel') || document.getElementById('phase4d-panel') || document.getElementById('phase4c-command-center') || safetyHeader.closest('.page-header');
    const panel = document.createElement('section');
    panel.id = 'phase7a-panel';
    panel.className = 'card wide-card phase7a-panel';
    panel.innerHTML = `
      <h2>Phase 7A FMCSA PDF Mapping</h2>
      <p>Use <b>FMCSA PDF</b> to map the saved Safety Performance report directly into the FMCSA Safety Performance History Records Request form.</p>
      <p class="phase7a-small">This uses the uploaded two-page fillable FMCSA/J.J. Keller PDF template and downloads a flattened completed PDF.</p>
    `;
    after.insertAdjacentElement('afterend', panel);
  }
  function addStyles() {
    if (document.getElementById('phase7a-style')) return;
    const style = document.createElement('style');
    style.id = 'phase7a-style';
    style.textContent = `
      .phase7a-panel { margin-bottom: 16px; padding: 16px; border-left: 5px solid #0f766e; }
      .phase7a-panel h2 { margin: 0 0 8px; }
      .phase7a-small { color: #64748b; font-size: 13px; }
      .phase7a-fmcsa { border: 1px solid #0f766e; background: #ccfbf1; color: #115e59; border-radius: 999px; padding: 7px 10px; font-size: 12px; font-weight: 900; margin-top: 8px; }
      .phase7a-fmcsa:hover { background: #99f6e4; }
      .phase7a-fmcsa:disabled { opacity: .65; cursor: wait; }
      .phase7a-built-row td { background: #ccfbf1 !important; }
      .phase7a-toast { position: fixed; right: 18px; bottom: 18px; z-index: 10008; background: #111827; color: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 18px 45px rgba(15,23,42,.25); font-size: 14px; max-width: 440px; }
      .phase7a-toast.danger { background: #991b1b; }
    `;
    document.head.appendChild(style);
  }
  function refresh() {
    const onSafetyPage = Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Safety Performance Reports');
    if (!onSafetyPage) return;
    addStyles();
    addPanel();
    addButtons();
  }
  setInterval(refresh, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
