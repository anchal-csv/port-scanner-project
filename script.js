let lastResults = null;
let currentFilter = 'all';

// Theme Toggle
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

themeToggle.addEventListener('click', () => {
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  themeToggle.textContent = isDark ? '☾' : '☀';
});

// Common Ports Toggle
const useCommonCheckbox = document.getElementById('useCommon');
const portStartInput    = document.getElementById('portStart');
const portEndInput      = document.getElementById('portEnd');

useCommonCheckbox.addEventListener('change', () => {
  const disabled = useCommonCheckbox.checked;
  portStartInput.disabled = disabled;
  portEndInput.disabled   = disabled;
  portStartInput.style.opacity = disabled ? '0.4' : '1';
  portEndInput.style.opacity   = disabled ? '0.4' : '1';
});

// Filter Buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyFilter();
  });
});

function applyFilter() {
  document.querySelectorAll('#resultsBody tr').forEach(row => {
    if (currentFilter === 'all') {
      row.classList.remove('hidden');
    } else {
      row.classList.toggle('hidden', row.dataset.status !== currentFilter);
    }
  });
}

// Progress Bar
let progressInterval = null;

function startProgress(target) {
  const wrap   = document.getElementById('progressWrap');
  const fill   = document.getElementById('progressFill');
  const status = document.getElementById('progressStatus');
  const ptgt   = document.getElementById('progressTarget');

  wrap.style.display = 'block';
  ptgt.textContent   = target;
  fill.style.width   = '0%';
  status.textContent = 'Resolving host...';

  let pct = 0;
  const phases = [
    { threshold: 15, msg: 'Resolving host...' },
    { threshold: 35, msg: 'Establishing connections...' },
    { threshold: 60, msg: 'Probing ports...' },
    { threshold: 80, msg: 'Detecting services...' },
    { threshold: 92, msg: 'Collecting results...' },
  ];

  progressInterval = setInterval(() => {
    const increment = pct < 30 ? 3 : pct < 70 ? 1.5 : 0.6;
    pct = Math.min(pct + increment, 92);
    fill.style.width = pct + '%';
    const phase = phases.slice().reverse().find(p => pct >= p.threshold);
    if (phase) status.textContent = phase.msg;
  }, 120);
}

function finishProgress() {
  clearInterval(progressInterval);
  const fill   = document.getElementById('progressFill');
  const status = document.getElementById('progressStatus');
  fill.style.width   = '100%';
  status.textContent = 'Scan complete.';
  setTimeout(() => {
    document.getElementById('progressWrap').style.display = 'none';
  }, 1200);
}

// Scan
document.getElementById('scanBtn').addEventListener('click', runScan);

async function runScan() {
  const target    = document.getElementById('target').value.trim();
  const portStart = parseInt(portStartInput.value, 10);
  const portEnd   = parseInt(portEndInput.value, 10);
  const useCommon = useCommonCheckbox.checked;

  hideError();
  hideResults();

  if (!target) { showError('Please enter a target host or IP address.'); return; }

  if (!useCommon) {
    if (isNaN(portStart) || isNaN(portEnd)) { showError('Please enter a valid port range.'); return; }
    if (portStart > portEnd)  { showError('Start port must be <= end port.'); return; }
    if (portEnd - portStart > 5000) { showError('Maximum port range is 5000 ports.'); return; }
  }

  const btn = document.getElementById('scanBtn');
  btn.disabled = true;
  btn.querySelector('span:last-child').textContent = 'SCANNING...';

  startProgress(target);

  try {
    const body = { target, use_common: useCommon };
    if (!useCommon) { body.port_start = portStart; body.port_end = portEnd; }

    const res  = await fetch('/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    finishProgress();

    if (!res.ok) { showError(data.error || 'Server error.'); return; }

    lastResults = data;
    renderResults(data);

  } catch (err) {
    finishProgress();
    showError('Network error: Could not reach the server. Is Flask running?');
  } finally {
    btn.disabled = false;
    btn.querySelector('span:last-child').textContent = 'INITIATE SCAN';
  }
}

// Render Results
function renderResults(data) {
  document.getElementById('statTarget').textContent  = data.target;
  document.getElementById('statIp').textContent      = data.ip;
  document.getElementById('statScanned').textContent = data.total_scanned;
  document.getElementById('statOpen').textContent    = data.open_count;
  document.getElementById('statTime').textContent    = data.elapsed + 's';
  document.getElementById('statsBar').style.display  = 'flex';

  const tbody = document.getElementById('resultsBody');
  tbody.innerHTML = '';

  data.results.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.dataset.status = r.status;
    tr.style.animationDelay = Math.min(i * 8, 400) + 'ms';
    const isOpen = r.status === 'open';
    tr.innerHTML = `
      <td><span class="port-num">${r.port}</span></td>
      <td><span class="service-name">${r.service}</span></td>
      <td><span class="badge ${isOpen ? 'badge-open' : 'badge-closed'}">${r.status.toUpperCase()}</span></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('resultsPanel').style.display = 'block';
  document.getElementById('exportBtn').style.display    = 'inline-flex';

  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');
  currentFilter = 'all';
  applyFilter();

  setTimeout(() => {
    document.getElementById('resultsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// Export
document.getElementById('exportBtn').addEventListener('click', () => {
  if (!lastResults) return;
  const lines = [
    `PORT SCAN REPORT`,
    `================`,
    `Target  : ${lastResults.target}`,
    `IP      : ${lastResults.ip}`,
    `Scanned : ${lastResults.total_scanned} ports`,
    `Open    : ${lastResults.open_count} ports`,
    `Time    : ${lastResults.elapsed}s`,
    ``,
    `PORT     SERVICE                STATUS`,
    `----     -------                ------`,
    ...lastResults.results.map(r =>
      `${String(r.port).padEnd(9)}${r.service.padEnd(23)}${r.status.toUpperCase()}`
    ),
    ``,
    `DISCLAIMER: Use this tool only on authorized systems.`
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `portscan_${lastResults.target}_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// Helpers
function showError(msg) {
  const box = document.getElementById('errorBox');
  box.textContent   = '⚠ ' + msg;
  box.style.display = 'block';
}
function hideError() { document.getElementById('errorBox').style.display = 'none'; }
function hideResults() {
  document.getElementById('statsBar').style.display     = 'none';
  document.getElementById('resultsPanel').style.display = 'none';
  document.getElementById('exportBtn').style.display    = 'none';
}

// Enter key shortcut
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') runScan();
});