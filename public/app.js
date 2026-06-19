const form = document.getElementById('fightForm');
const startBtn = document.getElementById('startBtn');
const statusCard = document.getElementById('statusCard');
const standingsCard = document.getElementById('standingsCard');
const gamesCard = document.getElementById('gamesCard');
const eventsCard = document.getElementById('eventsCard');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const summaryBox = document.getElementById('summary');
const diagnosticsBox = document.getElementById('diagnostics');
const standingsBox = document.getElementById('standings');
const datasetGroups = document.getElementById('datasetGroups');
const eventsPre = document.getElementById('events');
const compileLogsPre = document.getElementById('compileLogs');
const exportLink = document.getElementById('exportLink');
const botAInput = document.getElementById('botAInput');
const botBInput = document.getElementById('botBInput');
const botADataInput = document.getElementById('botADataInput');
const botBDataInput = document.getElementById('botBDataInput');
const botAName = document.getElementById('botAName');
const botBName = document.getElementById('botBName');
const botADataName = document.getElementById('botADataName');
const botBDataName = document.getElementById('botBDataName');
const inspectorCard = document.getElementById('inspectorCard');
const gameList = document.getElementById('gameList');
const inspectorMeta = document.getElementById('inspectorMeta');
const boardGrid = document.getElementById('boardGrid');
const turnDetails = document.getElementById('turnDetails');
const turnTimeline = document.getElementById('turnTimeline');
const turnRange = document.getElementById('turnRange');
const turnLabel = document.getElementById('turnLabel');
const prevTurn = document.getElementById('prevTurn');
const nextTurn = document.getElementById('nextTurn');
const rawLog = document.getElementById('rawLog');
const stderrLog = document.getElementById('stderrLog');
const datasetCountInput = document.getElementById('datasetCount');
const botATimeLimitInput = document.getElementById('botATimeLimitMs');
const botBTimeLimitInput = document.getElementById('botBTimeLimitMs');
const modeSelect = document.getElementById('modeSelect');
const duelFields = document.getElementById('duelFields');
const tournamentFields = document.getElementById('tournamentFields');
const tournamentBotsInput = document.getElementById('tournamentBotsInput');
const tournamentBotsName = document.getElementById('tournamentBotsName');
const tournamentRosterWrap = document.getElementById('tournamentRosterWrap');
const tournamentRosterTable = document.getElementById('tournamentRosterTable');
const simulationCountInput = document.getElementById('simulationCount');
const swissRoundsInput = document.getElementById('swissRounds');
const tournamentBotTimeLimitInput = document.getElementById('tournamentBotTimeLimitMs');
const tournamentPlayBothSidesInput = document.getElementById('tournamentPlayBothSides');
const pairingMethodInput = document.getElementById('pairingMethod');
const initialEloInput = document.getElementById('initialElo');
const eloKFactorInput = document.getElementById('eloKFactor');
const maxConcurrentGamesInput = document.getElementById('maxConcurrentGames');
const avoidRepeatOpponentsInput = document.getElementById('avoidRepeatOpponents');
const stopOnCompileErrorInput = document.getElementById('stopOnCompileError');
const swissRoundsField = document.getElementById('swissRoundsField');
const pairingMethodField = document.getElementById('pairingMethodField');
const initialEloField = document.getElementById('initialEloField');
const eloKFactorField = document.getElementById('eloKFactorField');
const avoidRepeatField = document.getElementById('avoidRepeatField');
const heroBotClocks = document.getElementById('heroBotClocks');
const heroProcessLimit = document.getElementById('heroProcessLimit');
const heroDatasetCount = document.getElementById('heroDatasetCount');
const tournamentStandingsWrap = document.getElementById('tournamentStandingsWrap');
const tournamentAnalyticsChart = document.getElementById('tournamentAnalyticsChart');
const tournamentStandingsTable = document.getElementById('tournamentStandingsTable');
const tournamentViews = document.getElementById('tournamentViews');
const simulationList = document.getElementById('simulationList');
const matchList = document.getElementById('matchList');
const pairMatrix = document.getElementById('pairMatrix');
const simulationDetail = document.getElementById('simulationDetail');
const pairDetail = document.getElementById('pairDetail');
const activeFilters = document.getElementById('activeFilters');
const matchSearchInput = document.getElementById('matchSearchInput');
const matchSortKeyInput = document.getElementById('matchSortKey');
const matchSortDirInput = document.getElementById('matchSortDir');
const matchPager = document.getElementById('matchPager');

const DEFAULT_READY_TIMEOUT_MS = 10000;
const PROCESS_TIME_LIMIT_GRACE_MS = 5000;

let currentJobId = null;
let currentJob = null;
let pollTimer = null;
let eventCursor = 0;
let selectedGameIndex = null;
let selectedTurn = 0;
let currentGameDetail = null;
let detailRequestSeq = 0;
let tournamentStandingsSort = { key: 'matchLossPct', dir: 'asc' };
let selectedSimulationIndex = null;
let selectedPair = null;
let currentSimulationDetail = null;
let simulationDetailRequestSeq = 0;
let tournamentBotRoster = [];
let currentMatchExplorer = { items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 };
let matchExplorerRequestSeq = 0;
let matchExplorerQuery = '';
let pairHistoryRequestSeq = 0;
let currentPairHistory = null;

botAInput?.addEventListener('change', () => updateFileName(botAInput, botAName));
botBInput?.addEventListener('change', () => updateFileName(botBInput, botBName));
botADataInput?.addEventListener('change', () => updateFileName(botADataInput, botADataName, 'Không dùng data.bin'));
botBDataInput?.addEventListener('change', () => updateFileName(botBDataInput, botBDataName, 'Không dùng data.bin'));
datasetCountInput?.addEventListener('input', syncSetupPreview);
botATimeLimitInput?.addEventListener('input', syncSetupPreview);
botBTimeLimitInput?.addEventListener('input', syncSetupPreview);
tournamentBotsInput?.addEventListener('change', syncTournamentBotNames);
simulationCountInput?.addEventListener('input', syncSetupPreview);
tournamentBotTimeLimitInput?.addEventListener('input', syncSetupPreview);
modeSelect?.addEventListener('change', syncModeVisibility);
matchSearchInput?.addEventListener('input', () => {
  matchExplorerQuery = String(matchSearchInput.value || '').trim();
  currentMatchExplorer.page = 1;
  if (currentJobId && isTournamentJob(currentJob)) loadMatchExplorer().catch(() => {});
});
matchSortKeyInput?.addEventListener('change', () => {
  currentMatchExplorer.page = 1;
  if (currentJobId && isTournamentJob(currentJob)) loadMatchExplorer().catch(() => {});
});
matchSortDirInput?.addEventListener('change', () => {
  currentMatchExplorer.page = 1;
  if (currentJobId && isTournamentJob(currentJob)) loadMatchExplorer().catch(() => {});
});
datasetGroups?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-game-index]');
  if (button) selectGame(Number(button.dataset.gameIndex));
});
gameList?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-game-index]');
  if (button) selectGame(Number(button.dataset.gameIndex));
});
matchList?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-game-index]');
  if (button) selectGame(Number(button.dataset.gameIndex));
});
simulationDetail?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-game-index]');
  if (button) selectGame(Number(button.dataset.gameIndex));
});
turnTimeline?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-turn]');
  if (!button || !currentGameDetail) return;
  selectedTurn = Number(button.dataset.turn || 0);
  renderReplay();
  renderTurnTimeline();
});
turnRange?.addEventListener('input', () => {
  selectedTurn = Number(turnRange.value || 0);
  renderReplay();
  renderTurnTimeline();
});
prevTurn?.addEventListener('click', () => {
  if (!currentGameDetail) return;
  selectedTurn = Math.max(0, selectedTurn - 1);
  renderReplay();
  renderTurnTimeline();
});
nextTurn?.addEventListener('click', () => {
  if (!currentGameDetail) return;
  selectedTurn = Math.min(currentGameDetail.moves.length, selectedTurn + 1);
  renderReplay();
  renderTurnTimeline();
});

syncModeVisibility();
syncSetupPreview();

function updateFileName(input, target, emptyText = 'Chưa chọn file') {
  const file = input.files?.[0];
  target.textContent = file ? file.name : emptyText;
  input.closest('.fileBox')?.classList.toggle('selected', !!file);
}

function syncTournamentBotNames() {
  const count = tournamentBotsInput?.files?.length || 0;
  if (!tournamentBotsName) return;
  if (!count) tournamentBotsName.textContent = 'Chưa chọn bot';
  else if (count === 1) tournamentBotsName.textContent = tournamentBotsInput.files[0].name;
  else tournamentBotsName.textContent = `${count} bot files selected`;
  tournamentBotRoster = Array.from(tournamentBotsInput?.files || []).map((file, index) => ({
    id: `roster-${index}`,
    fileName: file.name,
    name: file.name.replace(/\.cpp$/i, ''),
    tag: '',
    dataFile: null
  }));
  renderTournamentRoster();
}

function renderTournamentRoster() {
  if (!tournamentRosterWrap || !tournamentRosterTable) return;
  if (!tournamentBotRoster.length) {
    tournamentRosterWrap.classList.add('hidden');
    tournamentRosterTable.innerHTML = '';
    return;
  }
  tournamentRosterWrap.classList.remove('hidden');
  tournamentRosterTable.innerHTML = `
    <thead>
      <tr><th>#</th><th>File</th><th>Display name</th><th>Tag</th><th>data.bin</th></tr>
    </thead>
    <tbody>
      ${tournamentBotRoster.map((bot, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(bot.fileName)}</td>
          <td><input class="rosterNameInput" type="text" value="${escapeHtml(bot.name)}" data-roster-index="${index}" data-roster-field="name" /></td>
          <td><input class="rosterTagInput" type="text" value="${escapeHtml(bot.tag)}" data-roster-index="${index}" data-roster-field="tag" /></td>
          <td><input class="rosterDataInput" type="file" accept=".bin" data-roster-index="${index}" data-roster-field="dataFile" /></td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

function syncModeVisibility() {
  const mode = modeSelect?.value || 'duel';
  const swiss = mode === 'swiss';
  const isDuel = mode === 'duel';
  duelFields?.classList.toggle('hidden', !isDuel);
  tournamentFields?.classList.toggle('hidden', isDuel);
  for (const el of [botAInput, botBInput, botADataInput, botBDataInput]) {
    if (el) {
      el.required = isDuel;
      el.disabled = !isDuel;
    }
  }
  for (const el of [swissRoundsField, pairingMethodField, initialEloField, eloKFactorField, avoidRepeatField]) {
    el?.classList.toggle('hidden', !swiss);
  }
  syncSetupPreview();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  resetUiForRun();

  try {
    const mode = modeSelect?.value || 'duel';
    const duelMode = mode === 'duel';
    const fd = duelMode ? new FormData(form) : buildTournamentFormData(mode);
    const endpoint = duelMode ? '/api/start' : '/api/tournaments/start';
    const res = await fetch(endpoint, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cannot start job');
    currentJobId = data.jobId;
    eventCursor = 0;
    selectedGameIndex = null;
    selectedTurn = 0;
    currentGameDetail = null;
    exportLink.href = `/api/jobs/${currentJobId}/export.json`;
    startBtn.textContent = 'Running...';
    progressBar.parentElement.classList.add('running');
    pollTimer = setInterval(() => pollJob().catch(handlePollError), 900);
    await pollJob();
  } catch (err) {
    handlePollError(err);
  }
});

function resetUiForRun() {
  selectedGameIndex = null;
  selectedTurn = 0;
  currentGameDetail = null;
  detailRequestSeq++;
  tournamentStandingsSort = { key: 'matchLossPct', dir: 'asc' };
  selectedSimulationIndex = null;
  selectedPair = null;
  currentSimulationDetail = null;
  simulationDetailRequestSeq++;
  tournamentBotRoster = tournamentBotRoster || [];
  currentMatchExplorer = { items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 };
  currentPairHistory = null;
  pairHistoryRequestSeq++;
  matchExplorerRequestSeq++;
  startBtn.disabled = true;
  startBtn.classList.add('loading');
  startBtn.textContent = 'Starting...';
  statusCard.classList.remove('hidden');
  standingsCard.classList.remove('hidden');
  gamesCard.classList.remove('hidden');
  eventsCard.classList.remove('hidden');
  inspectorCard.classList.remove('hidden');
  standingsBox.classList.remove('hidden');
  tournamentStandingsWrap.classList.add('hidden');
  tournamentAnalyticsChart.classList.add('hidden');
  if (tournamentAnalyticsChart) tournamentAnalyticsChart.innerHTML = '';
  datasetGroups.classList.remove('hidden');
  tournamentViews.classList.add('hidden');
  summaryBox.innerHTML = '';
  diagnosticsBox.innerHTML = '';
  standingsBox.innerHTML = '';
  if (tournamentStandingsWrap) tournamentStandingsWrap.innerHTML = '<div class="tableScroll"><table id="tournamentStandingsTable" class="standingsTable"></table></div>';
  datasetGroups.innerHTML = '<div class="emptyState">Đang compile bot. Kết quả sẽ xuất hiện sau game đầu tiên.</div>';
  if (simulationList) simulationList.innerHTML = '';
  if (matchList) matchList.innerHTML = '';
  if (pairMatrix) pairMatrix.innerHTML = '';
  if (simulationDetail) simulationDetail.innerHTML = '';
  if (pairDetail) pairDetail.innerHTML = '';
  if (matchPager) matchPager.innerHTML = '';
  renderGameList([], {});
  renderInspectorEmpty('Chưa có game hoàn thành. Inspector sẽ tự mở game mới nhất khi có kết quả.');
  eventsPre.textContent = '';
  compileLogsPre.textContent = 'Compile logs will appear after compilation starts.';
  progressBar.style.width = '0%';
  exportLink.classList.add('hidden');
  statusText.textContent = 'QUEUED · Preparing job';
}

function handlePollError(err) {
  if (pollTimer) clearInterval(pollTimer);
  statusText.textContent = `ERROR · ${err.message}`;
  startBtn.disabled = false;
  startBtn.classList.remove('loading');
  startBtn.textContent = 'Start Fight';
  progressBar.parentElement.classList.remove('running');
}

async function pollJob() {
  if (!currentJobId) return;
  const [jobRes, eventsRes] = await Promise.all([
    fetch(`/api/jobs/${currentJobId}`),
    fetch(`/api/jobs/${currentJobId}/events?from=${eventCursor}`)
  ]);
  const job = await jobRes.json();
  const ev = await eventsRes.json();
  if (!jobRes.ok) throw new Error(job.error || 'Job not found');

  currentJob = job;
  renderJob(job);
  if (ev.events) {
    eventCursor = ev.next;
    appendEvents(ev.events);
  }

  if (job.status === 'done' || job.status === 'error') {
    clearInterval(pollTimer);
    startBtn.disabled = false;
    startBtn.classList.remove('loading');
    startBtn.textContent = 'Start Fight';
    progressBar.parentElement.classList.remove('running');
    exportLink.classList.remove('hidden');
  }
}

function renderJob(job) {
  if (isTournamentJob(job)) {
    renderTournamentJob(job);
    return;
  }
  const done = job.progress?.done || 0;
  const total = job.progress?.total || 0;
  const pct = total ? Math.round(done * 100 / total) : 0;
  progressBar.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', pct);

  const current = job.progress?.current || '';
  statusText.textContent = `${job.status.toUpperCase()} · ${current} · ${done}/${total}`;
  if (job.error) statusText.textContent += ` · ${job.error}`;

  if (job.summary) {
    renderSummary(job.summary);
    renderStandings(job.summary, job.settings || {});
  } else {
    renderPendingSummary(job.settings || {});
  }
  renderDatasets(job.games || [], job.settings || {});
  renderDiagnostics(job);
  renderCompileLogs(job.compileLogs || []);
  renderGameList(job.games || [], job.settings || {});
  if ((job.games || []).length && selectedGameIndex === null) {
    selectGame(job.games[job.games.length - 1].gameIndex);
  }
}

function isTournamentJob(job) {
  const mode = job?.summary?.mode || job?.settings?.mode;
  return mode === 'round_robin' || mode === 'swiss';
}

function buildTournamentFormData(mode) {
  const fd = new FormData();
  fd.append('mode', mode);
  for (const file of tournamentBotsInput?.files || []) fd.append('bots', file);
  fd.append('simulationCount', String(readPositiveNumber(simulationCountInput?.value, 20)));
  fd.append('swissRounds', String(readPositiveNumber(swissRoundsInput?.value, 20)));
  fd.append('botTimeLimitMs', String(readPositiveNumber(tournamentBotTimeLimitInput?.value, 10000)));
  fd.append('seedBase', document.getElementById('tournamentSeedBase')?.value || '');
  fd.append('playBothSides', String(!!tournamentPlayBothSidesInput?.checked));
  fd.append('pairingMethod', pairingMethodInput?.value || 'score_then_random');
  fd.append('initialElo', String(readPositiveNumber(initialEloInput?.value, 1500)));
  fd.append('eloKFactor', String(readPositiveNumber(eloKFactorInput?.value, 32)));
  fd.append('maxConcurrentGames', String(readPositiveNumber(maxConcurrentGamesInput?.value, 1)));
  fd.append('avoidRepeatOpponents', String(!!avoidRepeatOpponentsInput?.checked));
  fd.append('stopOnCompileError', String(!!stopOnCompileErrorInput?.checked));
  for (const file of tournamentBotsInput?.files || []) {
    const roster = tournamentBotRoster.find(item => item.fileName === file.name) || { name: file.name.replace(/\.cpp$/i, ''), tag: '' };
    fd.append('botNames', roster.name);
    fd.append('botTags', roster.tag);
    if (roster.dataFile) fd.append(`botData_${tournamentBotRoster.indexOf(roster)}`, roster.dataFile, roster.dataFile.name);
  }
  return fd;
}

function renderTournamentJob(job) {
  const analytics = job.summary?.analytics || {};
  statusText.textContent = `${job.status.toUpperCase()} · ${job.progress?.current || ''} · ${job.progress?.done || 0}/${job.progress?.total || 0}`;
  const done = job.progress?.done || 0;
  const total = job.progress?.total || 0;
  const pct = total ? Math.round(done * 100 / total) : 0;
  progressBar.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', pct);

  datasetGroups.classList.add('hidden');
  tournamentViews.classList.remove('hidden');
  standingsBox.classList.add('hidden');
  tournamentStandingsWrap.classList.remove('hidden');
  tournamentAnalyticsChart.classList.remove('hidden');

  renderTournamentSummary(job, analytics);
  renderTournamentDiagnostics(job, analytics);
  renderTournamentAnalyticsChart(job.summary?.standings || []);
  renderTournamentStandings(job.summary?.standings || []);
  renderSimulationList(job.summary?.simulations || []);
  ensureSelectedSimulationDetail();
  ensureMatchExplorerData();
  renderMatchList(currentMatchExplorer.items || []);
  renderSimulationDetail(job.summary?.simulations || [], getTournamentMatchSource(job));
  renderPairMatrix(job.summary?.pairMatrix || {}, job.summary?.standings || []);
  ensurePairHistory();
  renderPairDetail(currentPairHistory?.matches || []);
  renderActiveFilters();
  renderCompileLogs(job.compileLogs || []);

  if ((job.games || []).length) {
    renderGameList(job.games || [], job.settings || {});
    if (selectedGameIndex === null) selectGame(job.games[job.games.length - 1].gameIndex);
  } else {
    renderGameList([], {});
  }
}

function getTournamentMatchSource(job) {
  if (currentSimulationDetail && currentSimulationDetail.simulationIndex === selectedSimulationIndex) {
    return currentSimulationDetail.matches || [];
  }
  return job.summary?.recentMatches || [];
}

function ensureSelectedSimulationDetail() {
  if (!currentJob || !isTournamentJob(currentJob)) return;
  if (selectedSimulationIndex === null) {
    const first = currentJob.summary?.simulations?.[0];
    if (first) selectedSimulationIndex = first.simulationIndex;
  }
  if (selectedSimulationIndex === null) return;
  if (currentSimulationDetail && currentSimulationDetail.simulationIndex === selectedSimulationIndex) return;
  loadSimulationDetail(selectedSimulationIndex).catch(() => {});
}

function buildMatchExplorerParams() {
  const params = new URLSearchParams();
  if (selectedSimulationIndex !== null) params.set('simulationIndex', String(selectedSimulationIndex));
  if (selectedPair) {
    params.set('rowId', selectedPair.rowId);
    params.set('colId', selectedPair.colId);
  }
  if (matchExplorerQuery) params.set('query', matchExplorerQuery);
  params.set('sortKey', matchSortKeyInput?.value || 'simulationIndex');
  params.set('sortDir', matchSortDirInput?.value || 'desc');
  params.set('page', String(currentMatchExplorer.page || 1));
  params.set('pageSize', String(currentMatchExplorer.pageSize || 50));
  return params;
}

function ensureMatchExplorerData() {
  if (!currentJobId || !currentJob || !isTournamentJob(currentJob)) return;
  loadMatchExplorer().catch(() => {});
}

async function loadMatchExplorer() {
  if (!currentJobId) return;
  const requestId = ++matchExplorerRequestSeq;
  const res = await fetch(`/api/jobs/${currentJobId}/matches?${buildMatchExplorerParams().toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Cannot load match explorer');
  if (requestId !== matchExplorerRequestSeq) return;
  currentMatchExplorer = data;
  if (!currentJob || !isTournamentJob(currentJob)) return;
  renderMatchList(currentMatchExplorer.items || []);
  renderMatchPager();
}

function renderMatchPager() {
  if (!matchPager) return;
  const page = currentMatchExplorer.page || 1;
  const totalPages = currentMatchExplorer.totalPages || 1;
  const total = currentMatchExplorer.total || 0;
  matchPager.innerHTML = `
    <span>${total} matches</span>
    <span>page ${page}/${totalPages}</span>
    <button class="logBtn" type="button" data-match-page="prev" ${page <= 1 ? 'disabled' : ''}>Prev</button>
    <button class="logBtn" type="button" data-match-page="next" ${page >= totalPages ? 'disabled' : ''}>Next</button>
  `;
}

function ensurePairHistory() {
  if (!selectedPair || !currentJobId || !currentJob || !isTournamentJob(currentJob)) return;
  const key = `${selectedPair.rowId}::${selectedPair.colId}`;
  if (currentPairHistory && currentPairHistory.key === key) return;
  loadPairHistory(selectedPair.rowId, selectedPair.colId).catch(() => {});
}

async function loadPairHistory(rowId, colId) {
  if (!currentJobId) return;
  const requestId = ++pairHistoryRequestSeq;
  const res = await fetch(`/api/jobs/${currentJobId}/pairs/${encodeURIComponent(rowId)}/${encodeURIComponent(colId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Cannot load pair history');
  if (requestId !== pairHistoryRequestSeq) return;
  currentPairHistory = { key: `${rowId}::${colId}`, matches: data.matches || [] };
  renderPairDetail(currentPairHistory.matches);
}

async function loadSimulationDetail(simulationIndex) {
  if (!currentJobId) return;
  const requestId = ++simulationDetailRequestSeq;
  const res = await fetch(`/api/jobs/${currentJobId}/simulations/${simulationIndex}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Cannot load simulation detail');
  if (requestId !== simulationDetailRequestSeq) return;
  currentSimulationDetail = {
    simulationIndex,
    simulation: data.simulation,
    matches: data.matches || []
  };
  if (!currentJob || !isTournamentJob(currentJob)) return;
  renderMatchList(getTournamentMatchSource(currentJob));
  renderSimulationDetail(currentJob.summary?.simulations || [], getTournamentMatchSource(currentJob));
  renderPairDetail(getTournamentMatchSource(currentJob));
}

function renderTournamentSummary(job, analytics) {
  const progressMeta = describeTournamentProgress(job.progress || {});
  summaryBox.innerHTML = `
    <div class="metric"><span>Mode</span><b>${escapeHtml(String(job.settings?.mode || 'tournament'))}</b><small>${job.settings?.botCount || 0} bots</small></div>
    <div class="metric"><span>Simulations</span><b>${analytics.totalSimulations || 0}</b><small>planned ${job.settings?.simulationCount || 0}</small></div>
    <div class="metric"><span>Total matches</span><b>${analytics.totalMatches || 0}</b><small>games ${analytics.totalGames || 0}</small></div>
    <div class="metric"><span>Finished games</span><b>${analytics.finishedGames || 0}</b><small>non-ok ${analytics.nonOkGames || 0}</small></div>
    <div class="metric"><span>Current step</span><b>${escapeHtml(progressMeta.title)}</b><small>${escapeHtml(progressMeta.detail)}</small></div>
  `;
}

function renderTournamentDiagnostics(job, analytics) {
  diagnosticsBox.innerHTML = `
    <div class="metric"><span>Timeout count</span><b>${analytics.timeoutCount || 0}</b><small>invalid ${analytics.invalidCount || 0}</small></div>
    <div class="metric"><span>Process exits</span><b>${analytics.processExitCount || 0}</b><small>limit ${analytics.processLimitCount || 0}</small></div>
    <div class="metric"><span>Average move time</span><b>${formatMs(analytics.avgMoveMs)}</b><small>slowest game ${formatMs(analytics.slowestGameMs)}</small></div>
    <div class="metric"><span>Max memory</span><b>${formatKb(analytics.maxMemoryKb)}</b><small>wall ${formatMs(analytics.elapsedWallMs)}</small></div>
  `;
}

function renderTournamentAnalyticsChart(rows) {
  if (!tournamentAnalyticsChart) return;
  if (!rows.length) {
    tournamentAnalyticsChart.innerHTML = '<div class="emptyState">Biểu đồ win/draw/loss sẽ xuất hiện sau khi có simulation đầu tiên.</div>';
    return;
  }
  // Sort by win-rate desc so the strongest bots read top-down.
  const sorted = rows.slice().sort((a, b) => (b.matchWinPct || 0) - (a.matchWinPct || 0));
  const maxStdDev = Math.max(0.0001, ...sorted.map(r => Number(r.winRateStdDev) || 0));

  const bars = sorted.map(row => {
    const win = Math.round((row.matchWinPct || 0) * 100);
    const draw = Math.round((row.matchDrawPct || 0) * 100);
    const loss = Math.max(0, 100 - win - draw);
    const stdDev = Number(row.winRateStdDev) || 0;
    // Lower variance = more stable. Width of the marker reflects relative spread.
    const spreadPct = Math.round((stdDev / maxStdDev) * 100);
    const stabilityTitle = `Win-rate std dev ${formatPct(stdDev)} across simulations (lower = more stable)`;
    return `
      <div class="wdlRow">
        <div class="wdlName" title="Avg final rank ${formatNumber(row.avgFinalRank)} · Top-3 ${formatPct(row.top3RatePct)}">
          <span class="wdlRank">#${row.rank || '-'}</span>
          <span class="wdlBot">${escapeHtml(row.name)}</span>
        </div>
        <div class="wdlBar" role="img" aria-label="${escapeHtml(row.name)}: thắng ${win}%, hòa ${draw}%, thua ${loss}%">
          <span class="wdlSeg win" style="width:${win}%">${win >= 12 ? win + '%' : ''}</span>
          <span class="wdlSeg draw" style="width:${draw}%">${draw >= 12 ? draw + '%' : ''}</span>
          <span class="wdlSeg loss" style="width:${loss}%">${loss >= 12 ? loss + '%' : ''}</span>
        </div>
        <div class="wdlStability" title="${stabilityTitle}">
          <span class="wdlStabilityTrack"><span class="wdlStabilityFill" style="width:${spreadPct}%"></span></span>
          <small>±${formatPct(stdDev)}</small>
        </div>
      </div>`;
  }).join('');

  tournamentAnalyticsChart.innerHTML = `
    <div class="panelLabel">Win / Draw / Loss theo bot (trung bình qua các simulation)</div>
    <div class="wdlLegend legend">
      <span><i class="dot good"></i>Thắng</span>
      <span><i class="dot drawDot"></i>Hòa</span>
      <span><i class="dot bad"></i>Thua</span>
      <span><i class="dot stabilityDot"></i>Độ lệch win-rate (thấp = ổn định)</span>
    </div>
    <div class="wdlChart">${bars}</div>
  `;
}

function renderTournamentStandings(rows) {
  if (!rows.length) {
    tournamentStandingsTable.innerHTML = '';
    tournamentStandingsWrap.innerHTML = '<div class="emptyState">Chưa có standings.</div>';
    return;
  }
  const sortedRows = sortTournamentStandings(rows);
  tournamentStandingsWrap.innerHTML = '<div class="tableScroll"><table id="tournamentStandingsTable" class="standingsTable"></table></div>';
  const table = document.getElementById('tournamentStandingsTable');
  table.innerHTML = `
    <thead>
      <tr>
        <th>${sortButton('rank', 'Rank')}</th><th>${sortButton('name', 'Bot')}</th><th>${sortButton('matchWinPct', 'Match W%')}</th><th>${sortButton('matchDrawPct', 'D%')}</th><th>${sortButton('matchLossPct', 'L%')}</th><th>${sortButton('gameWinPct', 'Game W%')}</th><th>${sortButton('gameDrawPct', 'D%')}</th><th>${sortButton('gameLossPct', 'L%')}</th><th>${sortButton('avgMatchScore', 'Avg match')}</th><th>${sortButton('eloCurrent', 'Elo')}</th><th>${sortButton('eloAverage', 'Elo avg')}</th><th>${sortButton('avgCellsDiff', 'Cells avg')}</th><th>P10/P90</th><th>${sortButton('firstWinPct', 'First W%')}</th><th>${sortButton('secondWinPct', 'Second W%')}</th><th>${sortButton('powerScore', 'Power')}</th><th>${sortButton('safetyScore', 'Safety')}</th><th>${sortButton('stabilityScore', 'Stability')}</th><th>${sortButton('nonOkRate', 'Non-ok')}</th><th>Badges</th>
      </tr>
    </thead>
    <tbody>
      ${sortedRows.map(row => `
        <tr>
          <td>${row.rank || '-'}</td>
          <td><b>${escapeHtml(row.name)}</b></td>
          <td>${formatPct(row.matchWinPct)}</td>
          <td>${formatPct(row.matchDrawPct)}</td>
          <td>${formatPct(row.matchLossPct)}</td>
          <td>${formatPct(row.gameWinPct)}</td>
          <td>${formatPct(row.gameDrawPct)}</td>
          <td>${formatPct(row.gameLossPct)}</td>
          <td>${formatNumber(row.avgMatchScore)}</td>
          <td>${formatNumber(row.eloCurrent)}</td>
          <td>${formatNumber(row.eloAverage)}</td>
          <td>${formatNumber(row.avgCellsDiff)}</td>
          <td>${formatNumber(row.p10CellsDiff)} / ${formatNumber(row.p90CellsDiff)}</td>
          <td>${formatPct(row.firstWinPct)}</td>
          <td>${formatPct(row.secondWinPct)}</td>
          <td>${formatNumber(row.powerScore)}</td>
          <td>${formatNumber(row.safetyScore)}</td>
          <td>${formatNumber(row.stabilityScore)}</td>
          <td>${formatPct(row.nonOkRate)}</td>
          <td><div class="badgeRow">${(row.badges || []).map(b => `<span class="miniBadge">${escapeHtml(b)}</span>`).join('')}</div></td>
        </tr>`).join('')}
    </tbody>
  `;
}

function renderSimulationList(rows) {
  if (!rows.length) {
    simulationList.innerHTML = '<div class="emptyState">Chưa có simulation.</div>';
    return;
  }
  if (selectedSimulationIndex === null && rows.length) selectedSimulationIndex = rows[0].simulationIndex;
  simulationList.innerHTML = rows.map(sim => `
    <button class="simulationItem${sim.simulationIndex === selectedSimulationIndex ? ' active' : ''}" type="button" data-simulation-index="${sim.simulationIndex}">
      <h4>Simulation ${sim.simulationIndex + 1}</h4>
      <div class="simulationMeta">
        <span>${escapeHtml(sim.mode || '')}</span>
        <span>seed ${escapeHtml(shortSeed(sim.seed || ''))}</span>
        <span>non-ok ${sim.nonOkCount || 0}</span>
        <span>winner ${escapeHtml(getBotNameById(sim.winnerBotId))}</span>
      </div>
      <div class="simulationMeta">${(sim.topBots || []).map(bot => `#${bot.rank} ${escapeHtml(bot.name)}`).join(' · ')}</div>
    </button>
  `).join('');
}

function renderMatchList(rows) {
  if (!rows.length) {
    matchList.innerHTML = '<div class="emptyState">Chưa có match.</div>';
    renderMatchPager();
    return;
  }
  matchList.innerHTML = rows.map(match => `
    <div class="matchItem">
      <h4>${escapeHtml(match.botAName || getBotNameById(match.botAId))} vs ${escapeHtml(match.botBName || getBotNameById(match.botBId))}</h4>
      <div class="matchMeta">
        <span>sim ${match.simulationIndex + 1}</span>
        <span>${match.roundIndex === null || match.roundIndex === undefined ? 'round robin' : `round ${match.roundIndex + 1}`}</span>
        <span>${escapeHtml(shortSeed(match.datasetSeed || ''))}</span>
        <span>score ${formatNumber(match.scoreA)}:${formatNumber(match.scoreB)}</span>
        <span>${escapeHtml(match.classificationA || '')}</span>
        <span>cells ${formatNumber(match.cellsDiffA)}</span>
      </div>
      <div class="matchMeta">
        ${(match.games || []).map(game => `<button class="logBtn" type="button" data-game-index="${game.gameIndex}">Inspect game ${game.gameIndex + 1}</button>`).join(' ')}
      </div>
    </div>
  `).join('');
  renderMatchPager();
}

function renderActiveFilters() {
  if (!activeFilters) return;
  const parts = [];
  if (selectedSimulationIndex !== null) {
    parts.push(`<span class="filterChip">Simulation ${selectedSimulationIndex + 1} <button type="button" data-clear-filter="simulation" aria-label="Clear simulation filter">x</button></span>`);
  }
  if (selectedPair) {
    parts.push(`<span class="filterChip">${escapeHtml(getBotNameById(selectedPair.rowId))} vs ${escapeHtml(getBotNameById(selectedPair.colId))} <button type="button" data-clear-filter="pair" aria-label="Clear pair filter">x</button></span>`);
  }
  activeFilters.innerHTML = parts.join('') || '<span class="muted">No active filters</span>';
}

function renderSimulationDetail(simulations, matches) {
  if (!simulationDetail) return;
  const sim = simulations.find(item => item.simulationIndex === selectedSimulationIndex) || simulations[0];
  if (!sim) {
    simulationDetail.innerHTML = '<div class="emptyState">Chưa có simulation detail.</div>';
    return;
  }
  const roundCards = (sim.roundSummaries || []).map((round) => {
    const list = round.matches || [];
    const label = round.label || (round.roundIndex === null || round.roundIndex === undefined ? 'Round-robin pair set' : `Round ${round.roundIndex + 1}`);
    return `
      <div class="detailCard">
        <h5>${escapeHtml(label)}</h5>
        <div class="detailMeta">
          <span>pairs ${list.length}</span>
          ${round.byeBotId ? `<span>bye ${escapeHtml(getBotNameById(round.byeBotId))}</span>` : ''}
          ${(round.topBots || []).length ? `<span>${(round.topBots || []).map(bot => `#${bot.rank} ${escapeHtml(bot.name)}`).join(' · ')}</span>` : ''}
        </div>
        <div class="detailList">
          ${list.map(match => `
            <div class="detailRow">
              <div><b>${escapeHtml(match.botAName || getBotNameById(match.botAId))}</b> vs <b>${escapeHtml(match.botBName || getBotNameById(match.botBId))}</b></div>
              <div class="detailMeta">
                <span>score ${formatNumber(match.scoreA)}:${formatNumber(match.scoreB)}</span>
                <span>${escapeHtml(match.classificationA || '')}</span>
                <span>${escapeHtml(shortSeed(match.datasetSeed || ''))}</span>
                <span>cells ${formatSigned(match.cellsDiffA)}</span>
                ${match.repeatPairing ? '<span>repeat pairing</span>' : ''}
                ${match.nonOkCount ? `<span>non-ok ${match.nonOkCount}</span>` : ''}
              </div>
              <div class="detailMeta">
                ${(match.games || []).map(game => `<button class="logBtn" type="button" data-game-index="${game.gameIndex}">Inspect game ${game.gameIndex + 1}</button>`).join(' ')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });
  simulationDetail.innerHTML = `
    <div class="detailCard">
      <h4>Simulation ${sim.simulationIndex + 1}</h4>
      <div class="detailMeta">
        <span>${escapeHtml(sim.mode || '')}</span>
        <span>seed ${escapeHtml(shortSeed(sim.seed || ''))}</span>
        <span>winner ${escapeHtml(getBotNameById(sim.winnerBotId))}</span>
        <span>non-ok ${sim.nonOkCount || 0}</span>
      </div>
      <div class="detailMeta">${(sim.topBots || []).map(bot => `#${bot.rank} ${escapeHtml(bot.name)}`).join(' · ')}</div>
    </div>
    ${roundCards.join('') || '<div class="emptyState">No round detail in current polling window.</div>'}
  `;
}

function renderPairDetail(matches) {
  if (!pairDetail) return;
  if (!selectedPair) {
    pairDetail.innerHTML = '<div class="emptyState">Chọn một cell trong pair matrix để xem head-to-head.</div>';
    return;
  }
  const relevant = matches.filter(match => pairMatchesSelection(match, selectedPair));
  if (!relevant.length) {
    pairDetail.innerHTML = `<div class="emptyState">Không có match trong polling window cho cặp ${escapeHtml(getBotNameById(selectedPair.rowId))} vs ${escapeHtml(getBotNameById(selectedPair.colId))}.</div>`;
    return;
  }
  const rowName = getBotNameById(selectedPair.rowId);
  const colName = getBotNameById(selectedPair.colId);
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let scoreTotal = 0;
  let diffTotal = 0;
  let nonOk = 0;
  for (const match of relevant) {
    const rowPerspective = match.botAId === selectedPair.rowId
      ? { score: match.scoreA, diff: match.cellsDiffA, cls: match.classificationA }
      : { score: match.scoreB, diff: match.cellsDiffB, cls: match.classificationB };
    scoreTotal += rowPerspective.score;
    diffTotal += rowPerspective.diff;
    if (rowPerspective.cls === 'win') wins++;
    else if (rowPerspective.cls === 'draw') draws++;
    else losses++;
    nonOk += match.nonOkCount || 0;
  }
  pairDetail.innerHTML = `
    <div class="detailCard">
      <h4>${escapeHtml(rowName)} vs ${escapeHtml(colName)}</h4>
      <div class="detailMeta">
        <span><strong>${wins}</strong> wins</span>
        <span><strong>${draws}</strong> draws</span>
        <span><strong>${losses}</strong> losses</span>
        <span>avg score <strong>${formatNumber(scoreTotal / relevant.length)}</strong></span>
        <span>avg diff <strong>${formatSigned(diffTotal / relevant.length)}</strong></span>
        <span>non-ok <strong>${nonOk}</strong></span>
        <span>samples <strong>${relevant.length}</strong></span>
      </div>
    </div>
    <div class="detailCard">
      <h5>Recent matches</h5>
      <div class="detailList">
        ${relevant.map(match => {
          const rowPerspective = match.botAId === selectedPair.rowId
            ? { score: match.scoreA, diff: match.cellsDiffA, cls: match.classificationA, games: match.games }
            : { score: match.scoreB, diff: match.cellsDiffB, cls: match.classificationB, games: (match.games || []).slice().reverse() };
          return `
            <div class="detailRow">
              <div><b>Simulation ${match.simulationIndex + 1}</b> · ${match.roundIndex === null || match.roundIndex === undefined ? 'round robin' : `round ${match.roundIndex + 1}`}</div>
              <div class="detailMeta">
                <span>${escapeHtml(shortSeed(match.datasetSeed || ''))}</span>
                <span>score ${formatNumber(rowPerspective.score)}</span>
                <span>${escapeHtml(rowPerspective.cls || '')}</span>
                <span>cells ${formatSigned(rowPerspective.diff)}</span>
                ${match.nonOkCount ? `<span>non-ok ${match.nonOkCount}</span>` : ''}
              </div>
              <div class="detailMeta">
                ${(rowPerspective.games || []).map(game => `<button class="logBtn" type="button" data-game-index="${game.gameIndex}">Inspect game ${game.gameIndex + 1}</button>`).join(' ')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function pairMatchesSelection(match, pair) {
  return (match.botAId === pair.rowId && match.botBId === pair.colId) || (match.botAId === pair.colId && match.botBId === pair.rowId);
}

function sortTournamentStandings(rows) {
  const { key, dir } = tournamentStandingsSort;
  const factor = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * factor;
    if (Number(av) === Number(bv)) return (a.rank - b.rank) * factor;
    return (Number(av) - Number(bv)) * factor;
  });
}

function sortButton(key, label) {
  const active = tournamentStandingsSort.key === key;
  const arrow = active ? (tournamentStandingsSort.dir === 'asc' ? ' ↑' : ' ↓') : '';
  return `<button class="tableSortBtn${active ? ' active' : ''}" type="button" data-sort-key="${key}">${label}${arrow}</button>`;
}

function renderPairMatrix(matrix, rows) {
  if (!rows.length) {
    pairMatrix.innerHTML = '<div class="emptyState">Chưa có pair matrix.</div>';
    return;
  }
  const ids = rows.map(row => row.botId);
  pairMatrix.innerHTML = `
    <table class="pairMatrixTable">
      <thead>
        <tr><th>Bot</th>${rows.map(row => `<th>${escapeHtml(shortName(row.name))}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <th>${escapeHtml(shortName(row.name))}</th>
            ${ids.map(colId => renderPairMatrixCell(row.botId, colId, matrix)).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderPairMatrixCell(rowId, colId, matrix) {
  if (rowId === colId) return '<td><div class="matrixCell neutral">-</div></td>';
  const cell = matrix?.[rowId]?.[colId];
  if (!cell || !cell.matches) return '<td><div class="matrixCell neutral">n/a</div></td>';
  const avgScore = cell.matches ? cell.aScoreTotal / cell.matches : 0;
  const avgDiff = cell.matches ? cell.aCellsDiffTotal / cell.matches : 0;
  const winPct = cell.matches ? cell.aWins / cell.matches : 0;
  const cls = avgScore > 1.05 ? 'good' : avgScore < 0.95 ? 'bad' : 'draw';
  const active = selectedPair && selectedPair.rowId === rowId && selectedPair.colId === colId ? ' active' : '';
  return `<td><button class="matrixCell ${cls}${active}" type="button" data-matrix-row="${rowId}" data-matrix-col="${colId}" title="wins ${cell.aWins}, draws ${cell.draws}, losses ${cell.aLosses}, non-ok ${cell.nonOk}"><b>${formatPct(winPct)} W</b><br/>avg ${formatNumber(avgScore)}<br/>${formatSigned(avgDiff)} cells<br/>n=${cell.matches}<small>${cell.aWins}-${cell.draws}-${cell.aLosses} · non-ok ${cell.nonOk}</small></button></td>`;
}

tournamentStandingsWrap?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-sort-key]');
  if (!button || !currentJob) return;
  const key = button.dataset.sortKey;
  if (tournamentStandingsSort.key === key) tournamentStandingsSort.dir = tournamentStandingsSort.dir === 'asc' ? 'desc' : 'asc';
  else tournamentStandingsSort = { key, dir: key === 'name' ? 'asc' : 'desc' };
  renderTournamentStandings(currentJob.summary?.standings || []);
});

simulationList?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-simulation-index]');
  if (!button || !currentJob) return;
  selectedSimulationIndex = Number(button.dataset.simulationIndex);
  currentSimulationDetail = null;
  currentMatchExplorer.page = 1;
  renderSimulationList(currentJob.summary?.simulations || []);
  renderMatchList(currentMatchExplorer.items || []);
  renderSimulationDetail(currentJob.summary?.simulations || [], getTournamentMatchSource(currentJob));
  currentPairHistory = null;
  renderPairDetail(currentPairHistory?.matches || []);
  renderActiveFilters();
  loadSimulationDetail(selectedSimulationIndex).catch(() => {});
  loadMatchExplorer().catch(() => {});
});

pairMatrix?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-matrix-row][data-matrix-col]');
  if (!button || !currentJob) return;
  selectedPair = {
    rowId: button.dataset.matrixRow,
    colId: button.dataset.matrixCol
  };
  currentMatchExplorer.page = 1;
  currentPairHistory = null;
  renderPairMatrix(currentJob.summary?.pairMatrix || {}, currentJob.summary?.standings || []);
  renderPairDetail(currentPairHistory?.matches || []);
  renderMatchList(currentMatchExplorer.items || []);
  renderActiveFilters();
  loadPairHistory(selectedPair.rowId, selectedPair.colId).catch(() => {});
  loadMatchExplorer().catch(() => {});
});

pairDetail?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-game-index]');
  if (button) selectGame(Number(button.dataset.gameIndex));
});

activeFilters?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-clear-filter]');
  if (!button || !currentJob) return;
  const which = button.dataset.clearFilter;
  if (which === 'simulation') selectedSimulationIndex = null;
  if (which === 'pair') selectedPair = null;
  if (which === 'simulation') currentSimulationDetail = null;
  if (which === 'pair') currentPairHistory = null;
  currentMatchExplorer.page = 1;
  renderSimulationList(currentJob.summary?.simulations || []);
  renderMatchList(currentMatchExplorer.items || []);
  renderSimulationDetail(currentJob.summary?.simulations || [], getTournamentMatchSource(currentJob));
  renderPairMatrix(currentJob.summary?.pairMatrix || {}, currentJob.summary?.standings || []);
  renderPairDetail(currentPairHistory?.matches || []);
  renderActiveFilters();
  ensureSelectedSimulationDetail();
  loadMatchExplorer().catch(() => {});
});

tournamentRosterTable?.addEventListener('input', (e) => {
  const input = e.target.closest('input[data-roster-index][data-roster-field]');
  if (!input) return;
  const index = Number(input.dataset.rosterIndex);
  const field = input.dataset.rosterField;
  if (!tournamentBotRoster[index]) return;
  tournamentBotRoster[index][field] = input.value;
});

tournamentRosterTable?.addEventListener('change', (e) => {
  const input = e.target.closest('input[type="file"][data-roster-index][data-roster-field="dataFile"]');
  if (!input) return;
  const index = Number(input.dataset.rosterIndex);
  if (!tournamentBotRoster[index]) return;
  tournamentBotRoster[index].dataFile = input.files?.[0] || null;
});

matchPager?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-match-page]');
  if (!button || !currentJobId || !currentJob || !isTournamentJob(currentJob)) return;
  if (button.dataset.matchPage === 'prev' && currentMatchExplorer.page > 1) currentMatchExplorer.page--;
  if (button.dataset.matchPage === 'next' && currentMatchExplorer.page < currentMatchExplorer.totalPages) currentMatchExplorer.page++;
  loadMatchExplorer().catch(() => {});
});

function renderPendingSummary(settings) {
  const total = (settings.datasetCount || 0) * (settings.playBothSides ? 2 : 1);
  summaryBox.innerHTML = `
    <div class="metric"><span>Bot A</span><b>${escapeHtml(shortName(settings.botAName || 'Bot A'))}</b><small>Waiting</small></div>
    <div class="metric"><span>Bot B</span><b>${escapeHtml(shortName(settings.botBName || 'Bot B'))}</b><small>Waiting</small></div>
    <div class="metric"><span>Games planned</span><b>${total || '-'}</b><small>${settings.playBothSides ? 'Role-swap on' : 'Single side'}</small></div>
    <div class="metric"><span>Bot A clock</span><b>${formatMs(settings.botATimeLimitMs)}</b><small>per game</small></div>
    <div class="metric"><span>Bot B clock</span><b>${formatMs(settings.botBTimeLimitMs)}</b><small>per game</small></div>
    <div class="metric"><span>Seed base</span><b>${escapeHtml(shortSeed(settings.seedBase || 'random'))}</b><small>Generated at start</small></div>
  `;
  standingsBox.innerHTML = '<div class="emptyState">Standings sẽ hiện sau game đầu tiên.</div>';
}

function renderSummary(s) {
  const lead = s.botA.totalScore - s.botB.totalScore;
  const leader = lead > 0 ? 'Bot A đang dẫn' : lead < 0 ? 'Bot B đang dẫn' : 'Đang hòa điểm';
  summaryBox.innerHTML = `
    <div class="metric"><span>Bot A W/D/L</span><b>${s.botA.wins}/${s.botA.draws}/${s.botA.losses}</b><small>${s.botA.totalScore} total cells</small></div>
    <div class="metric"><span>Bot B W/D/L</span><b>${s.botB.wins}/${s.botB.draws}/${s.botB.losses}</b><small>${s.botB.totalScore} total cells</small></div>
    <div class="metric"><span>Total score A:B</span><b>${s.botA.totalScore}:${s.botB.totalScore}</b><small>${leader}</small></div>
    <div class="metric"><span>Games</span><b>${s.gamesDone}/${s.gamesTotal}</b><small>${s.playBothSides ? 'role-swap enabled' : 'single side'}</small></div>
  `;
}

function renderStandings(s, settings) {
  const aName = shortName(settings.botAName || 'Bot A');
  const bName = shortName(settings.botBName || 'Bot B');
  standingsBox.innerHTML = `
    ${standingCard('A', aName, s.botA, s.botA.totalScore - s.botB.totalScore)}
    ${standingCard('B', bName, s.botB, s.botB.totalScore - s.botA.totalScore)}
  `;
}

function standingCard(label, name, bot, diff) {
  const diffClass = diff > 0 ? 'good' : diff < 0 ? 'bad' : 'draw';
  const diffText = diff > 0 ? `+${diff}` : String(diff);
  return `
    <div class="standingCard">
      <div class="standingTop">
        <div class="standingName"><span class="avatar ${label.toLowerCase()}">${label}</span><span>${escapeHtml(name)}</span></div>
        <span class="pill ${diffClass}">${diffText} cells</span>
      </div>
      <div class="record">
        <div><small>Wins</small><b>${bot.wins}</b></div>
        <div><small>Draws</small><b>${bot.draws}</b></div>
        <div><small>Losses</small><b>${bot.losses}</b></div>
      </div>
    </div>`;
}

function renderDiagnostics(job) {
  const games = job.games || [];
  if (!games.length) {
    diagnosticsBox.innerHTML = `
      <div class="metric"><span>Peak RSS A</span><b>-</b><small>Waiting for first game</small></div>
      <div class="metric"><span>Peak RSS B</span><b>-</b><small>Waiting for first game</small></div>
      <div class="metric"><span>Slowest turn</span><b>-</b><small>Turn timing not sampled yet</small></div>
      <div class="metric"><span>Non-ok games</span><b>0</b><small>No completed games yet</small></div>
    `;
    return;
  }

  const peakA = maxDefined(games.map(g => g.botAMaxRssKb));
  const peakB = maxDefined(games.map(g => g.botBMaxRssKb));
  const slowest = maxDefined(games.map(g => g.maxMoveMs));
  const avgMove = Math.round(games.reduce((sum, g) => sum + Number(g.avgMoveMs || 0), 0) / games.length);
  const badGames = games.filter(g => !['finished', 'ok'].includes(g.status)).length;
  const completed = `${games.length}/${job.progress?.total || games.length}`;

  diagnosticsBox.innerHTML = `
    <div class="metric"><span>Peak RSS A</span><b>${formatKb(peakA)}</b><small>${escapeHtml(shortName(job.settings?.botAName || 'Bot A'))}</small></div>
    <div class="metric"><span>Peak RSS B</span><b>${formatKb(peakB)}</b><small>${escapeHtml(shortName(job.settings?.botBName || 'Bot B'))}</small></div>
    <div class="metric"><span>Slowest turn</span><b>${formatMs(slowest)}</b><small>avg ${formatMs(avgMove)}</small></div>
    <div class="metric"><span>Non-ok games</span><b>${badGames}</b><small>${completed} completed</small></div>
  `;
}

function renderCompileLogs(logs) {
  if (!compileLogsPre) return;
  if (!logs.length) {
    compileLogsPre.textContent = 'Compile logs will appear after compilation starts.';
    return;
  }
  compileLogsPre.textContent = logs.map(entry => {
    const stdout = String(entry.stdout || '').trim() || '(empty stdout)';
    const stderr = String(entry.stderr || '').trim() || '(empty stderr)';
    return `BOT ${entry.bot}\nSTDOUT\n${stdout}\n\nSTDERR\n${stderr}`;
  }).join('\n\n---\n\n');
}

function renderDatasets(games, settings) {
  datasetGroups.classList.remove('hidden');
  tournamentViews.classList.add('hidden');
  if (!games.length) {
    datasetGroups.innerHTML = '<div class="emptyState">Chưa có game nào hoàn thành.</div>';
    return;
  }

  const grouped = new Map();
  for (const g of games) {
    if (!grouped.has(g.datasetIndex)) grouped.set(g.datasetIndex, []);
    grouped.get(g.datasetIndex).push(g);
  }

  const cards = [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([datasetIndex, list]) => renderDatasetCard(datasetIndex, list, settings));

  datasetGroups.innerHTML = cards.join('');
}

function renderDatasetCard(datasetIndex, games, settings) {
  if (!games.length) {
    return `
      <article class="datasetCard">
        <div class="datasetHeader">
          <div class="datasetTitle"><h3>Dataset ${datasetIndex + 1}</h3><span class="pill neutral">waiting</span></div>
          <div class="datasetScore">A 0 · B 0</div>
        </div>
        <div class="datasetBody"><div class="emptyState">Dataset này chưa chạy.</div></div>
      </article>`;
  }

  const sorted = games.slice().sort((a, b) => a.gameIndex - b.gameIndex);
  const expectedGames = settings.playBothSides ? 2 : 1;
  const isPartial = sorted.length < expectedGames;
  const aTotal = sorted.reduce((sum, g) => sum + Number(g.botAScore || 0), 0);
  const bTotal = sorted.reduce((sum, g) => sum + Number(g.botBScore || 0), 0);
  const setClass = isPartial ? 'neutral' : aTotal > bTotal ? 'good' : bTotal > aTotal ? 'bad' : 'draw';
  const setText = isPartial
    ? `${sorted.length}/${expectedGames} games done`
    : aTotal > bTotal ? 'A wins dataset' : bTotal > aTotal ? 'B wins dataset' : 'Dataset draw';
  const seed = sorted[0]?.seed || '';
  const bodyClass = expectedGames === 1 && sorted.length === 1 ? 'singleOnly' : '';
  const missingSwapCard = settings.playBothSides && sorted.length === 1
    ? `
        <div class="gameCard">
          <div class="gameTop">
            <div>
              <h4>${sorted[0].aRole === 0 ? 'Game 2 · Đảo lượt' : 'Game 1 · Lượt gốc'}</h4>
              <div class="roleLine">Đợi game còn lại của dataset này</div>
            </div>
            <span class="pill neutral">PENDING</span>
          </div>
          <div class="metaRow">
            <span>Game đầu đã xong, card này sẽ tự update ngay khi game kế tiếp kết thúc.</span>
          </div>
        </div>`
    : '';

  return `
    <article class="datasetCard">
      <div class="datasetHeader">
        <div class="datasetTitle">
          <h3>Dataset ${datasetIndex + 1}</h3>
          <span class="pill ${setClass}">${setText}</span>
          ${seed ? `<span class="seed" title="${escapeHtml(seed)}">${escapeHtml(shortSeed(seed))}</span>` : ''}
        </div>
        <div class="datasetScore"><b>A ${aTotal}</b><span>:</span><b>B ${bTotal}</b></div>
      </div>
      <div class="datasetBody ${bodyClass}">
        ${sorted.map((g, idx) => renderGameCard(g, idx, sorted.length, settings)).join('')}
        ${missingSwapCard}
      </div>
    </article>`;
}

function renderGameCard(g, idxInDataset, totalInDataset, settings) {
  const isSwap = g.aRole === 1;
  const title = settings.playBothSides || totalInDataset > 1
    ? (isSwap ? 'Game 2 · Đảo lượt' : 'Game 1 · Lượt gốc')
    : `Game ${g.gameIndex + 1}`;
  const roleLine = isSwap
    ? 'B FIRST · A SECOND'
    : 'A FIRST · B SECOND';
  const resultClass = g.draw ? 'draw' : g.botAWon ? 'good' : 'bad';
  const resultText = g.draw ? 'DRAW' : g.botAWon ? 'A WIN' : 'B WIN';
  const aIsWinner = !g.draw && g.botAWon;
  const bIsWinner = !g.draw && g.botBWon;
  const firstLabel = g.aRole === 0 ? 'A / FIRST' : 'B / FIRST';
  const secondLabel = g.aRole === 0 ? 'B / SECOND' : 'A / SECOND';
  const firstScore = g.firstScore;
  const secondScore = g.secondScore;
  const aName = shortName(settings.botAName || 'Bot A');
  const bName = shortName(settings.botBName || 'Bot B');
  const className = totalInDataset === 1 ? 'gameCard single' : 'gameCard';

  return `
    <div class="${className}">
      <div class="gameTop">
        <div>
          <h4>${escapeHtml(title)}</h4>
          <div class="roleLine">${escapeHtml(roleLine)}</div>
        </div>
        <span class="pill ${resultClass}">${resultText}</span>
      </div>

      <div class="scoreGrid">
        <div class="scoreBox ${aIsWinner ? 'winner' : ''}">
          <div class="name"><span>A</span><small>${escapeHtml(aName)}</small></div>
          <div class="score">${g.botAScore}</div>
        </div>
        <div class="scoreBox ${bIsWinner ? 'winner' : ''}">
          <div class="name"><span>B</span><small>${escapeHtml(bName)}</small></div>
          <div class="score">${g.botBScore}</div>
        </div>
      </div>

      <div class="metaRow">
        <span>${escapeHtml(firstLabel)}: ${firstScore}</span>
        <span>${escapeHtml(secondLabel)}: ${secondScore}</span>
        <span>${g.moves} moves</span>
        <span>${Math.round((g.elapsedMs || 0) / 100) / 10}s</span>
        <span>max turn ${formatMs(g.maxMoveMs)}</span>
        <span>left A ${formatMs(g.botARemainingMs)}</span>
        <span>left B ${formatMs(g.botBRemainingMs)}</span>
        <span>mem A ${formatKb(g.botAMaxRssKb)}</span>
        <span>mem B ${formatKb(g.botBMaxRssKb)}</span>
        <span>${escapeHtml(g.status || 'ok')}${g.reason ? ': ' + escapeHtml(g.reason) : ''}</span>
        <button class="logBtn" type="button" data-game-index="${g.gameIndex}">Inspect</button>
        <a class="logBtn" href="/api/jobs/${currentJobId}/games/${g.gameIndex}/log" target="_blank">Raw log</a>
      </div>
    </div>`;
}

async function selectGame(gameIndex) {
  if (!currentJobId) return;
  selectedGameIndex = gameIndex;
  currentGameDetail = null;
  renderGameList(currentJob?.games || [], currentJob?.settings || {});
  renderInspectorLoading(gameIndex);

  const requestId = ++detailRequestSeq;
  try {
    const res = await fetch(`/api/jobs/${currentJobId}/games/${gameIndex}/detail`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cannot load game detail');
    if (requestId !== detailRequestSeq || selectedGameIndex !== gameIndex) return;
    currentGameDetail = data;
    selectedTurn = data.moves?.length || 0;
    renderInspectorDetail();
  } catch (err) {
    if (requestId !== detailRequestSeq) return;
    renderInspectorError(err);
  }
}

function renderGameList(games, settings) {
  if (!gameList) return;
  if (!games.length) {
    gameList.innerHTML = '<div class="emptyState">Chưa có game hoàn thành.</div>';
    return;
  }

  gameList.innerHTML = games.map(g => {
    const active = g.gameIndex === selectedGameIndex ? ' active' : '';
    const resultClass = g.draw ? 'draw' : g.botAWon ? 'good' : 'bad';
    const resultText = g.draw ? 'DRAW' : g.botAWon ? 'A WIN' : 'B WIN';
    const first = g.aRole === 1 ? 'B' : 'A';
    const second = g.aRole === 1 ? 'A' : 'B';
    const aName = isTournamentJob(currentJob) ? getBotNameById(g.botAId) : shortName(settings.botAName || 'Bot A');
    const bName = isTournamentJob(currentJob) ? getBotNameById(g.botBId) : shortName(settings.botBName || 'Bot B');
    return `
      <button class="gameListItem${active}" type="button" data-game-index="${g.gameIndex}">
        <span class="gameListTop"><b>Game ID ${g.gameIndex + 1}</b><span class="pill ${resultClass}">${resultText}</span></span>
        <span>FIRST: Bot ${first} · SECOND: Bot ${second}</span>
        <span>Bot A ${g.botAScore} (${escapeHtml(aName)}) · Bot B ${g.botBScore} (${escapeHtml(bName)})</span>
        <small>${g.moves} turns · left A/B ${formatMs(g.botARemainingMs)} / ${formatMs(g.botBRemainingMs)} · RSS ${formatKb(g.botAMaxRssKb)} / ${formatKb(g.botBMaxRssKb)}</small>
      </button>`;
  }).join('');
}

function renderInspectorLoading(gameIndex) {
  inspectorMeta.innerHTML = `
    <div class="metric"><span>Game</span><b>#${gameIndex + 1}</b><small>Loading detail</small></div>
    <div class="metric"><span>Replay</span><b>...</b><small>Fetching moves</small></div>
    <div class="metric"><span>Raw log</span><b>...</b><small>Fetching protocol</small></div>
  `;
  boardGrid.innerHTML = '<div class="emptyState boardEmpty">Đang tải replay.</div>';
  turnDetails.innerHTML = '';
  turnTimeline.innerHTML = '';
  rawLog.textContent = '';
  stderrLog.textContent = '';
  turnRange.disabled = true;
  prevTurn.disabled = true;
  nextTurn.disabled = true;
  turnLabel.textContent = 'Loading';
}

function renderInspectorEmpty(message) {
  inspectorMeta.innerHTML = `<div class="emptyState">${escapeHtml(message)}</div>`;
  boardGrid.innerHTML = '';
  turnDetails.innerHTML = '';
  turnTimeline.innerHTML = '';
  rawLog.textContent = '';
  stderrLog.textContent = '';
  turnRange.disabled = true;
  prevTurn.disabled = true;
  nextTurn.disabled = true;
  turnLabel.textContent = 'Initial board';
}

function renderInspectorError(err) {
  inspectorMeta.innerHTML = `<div class="emptyState errorState">${escapeHtml(err.message)}</div>`;
  boardGrid.innerHTML = '';
  turnDetails.innerHTML = '';
  turnTimeline.innerHTML = '';
  rawLog.textContent = '';
  stderrLog.textContent = '';
}

function renderInspectorDetail() {
  const g = currentGameDetail;
  const resultClass = g.draw ? 'draw' : g.botAWon ? 'good' : 'bad';
  const resultText = g.draw ? 'DRAW' : g.botAWon ? 'A WIN' : 'B WIN';
  const role = g.aRole === 1 ? 'B FIRST / A SECOND' : 'A FIRST / B SECOND';
  inspectorMeta.innerHTML = `
    <div class="metric"><span>Result</span><b>${resultText}</b><small>${escapeHtml(role)}</small></div>
    <div class="metric"><span>Score A:B</span><b>${g.botAScore}:${g.botBScore}</b><small><span class="pill ${resultClass}">${escapeHtml(g.status || 'ok')}</span></small></div>
    <div class="metric"><span>Turns</span><b>${g.moves.length}</b><small>max ${formatMs(g.maxMoveMs)} · avg ${formatMs(g.avgMoveMs)}</small></div>
    <div class="metric"><span>Peak RSS</span><b>${formatKb(maxDefined([g.botAMaxRssKb, g.botBMaxRssKb]))}</b><small>A ${formatKb(g.botAMaxRssKb)} · B ${formatKb(g.botBMaxRssKb)}</small></div>
  `;
  rawLog.textContent = g.log || '';
  stderrLog.textContent = `FIRST stderr\n${g.stderr?.first || '(empty)'}\n\nSECOND stderr\n${g.stderr?.second || '(empty)'}`;
  renderReplay();
  renderTurnTimeline();
}

function renderReplay() {
  const g = currentGameDetail;
  if (!g) return;
  const maxTurn = g.moves.length;
  selectedTurn = Math.max(0, Math.min(maxTurn, selectedTurn));
  turnRange.max = String(maxTurn);
  turnRange.value = String(selectedTurn);
  turnRange.disabled = maxTurn === 0;
  prevTurn.disabled = selectedTurn <= 0;
  nextTurn.disabled = selectedTurn >= maxTurn;
  turnLabel.textContent = selectedTurn === 0 ? 'Initial board' : `After turn ${selectedTurn} / ${maxTurn}`;

  const state = buildReplayState(g, selectedTurn);
  const lastMove = selectedTurn > 0 ? g.moves[selectedTurn - 1] : null;
  boardGrid.innerHTML = state.originals.map((digit, idx) => {
    const r = Math.floor(idx / 17);
    const c = idx % 17;
    const owner = state.owners[idx];
    const ownerClass = owner === 0 ? ' firstOwned' : owner === 1 ? ' secondOwned' : '';
    const active = lastMove && !lastMove.move.pass && inRect(r, c, lastMove.move) ? ' activeRect' : '';
    const title = owner === -1 ? `r${r} c${c} · value ${digit}` : `r${r} c${c} · ${botNameForPlayer(g, owner)} owns value ${digit}`;
    return `<span class="boardCell${ownerClass}${active}" role="gridcell" title="${escapeHtml(title)}">${digit}</span>`;
  }).join('');

  turnDetails.innerHTML = renderTurnDetail(g, selectedTurn);
}

function renderTurnTimeline() {
  const g = currentGameDetail;
  if (!g) return;
  if (!g.moves.length) {
    turnTimeline.innerHTML = '<div class="emptyState">Game không có move.</div>';
    return;
  }

  turnTimeline.innerHTML = `
    <table>
      <thead>
        <tr><th>Turn</th><th>Bot</th><th>Move</th><th>Time</th><th>Score</th><th>Remaining</th><th>Legal</th><th>RSS</th></tr>
      </thead>
      <tbody>
        ${g.moves.map((m, idx) => {
          const turn = idx + 1;
          const active = turn === selectedTurn ? ' class="active"' : '';
          const rss = m.player === 0 ? m.memoryFirstKb : m.memorySecondKb;
          return `
            <tr${active}>
              <td><button class="turnJump" type="button" data-turn="${turn}">${turn}</button></td>
              <td>${escapeHtml(botNameForPlayer(g, m.player))}</td>
              <td><code>${escapeHtml(formatMove(m.move))}</code></td>
              <td>${formatMs(m.elapsedMs)}</td>
              <td>${m.scoreFirst}:${m.scoreSecond}</td>
              <td>${formatMs(m.remainingFirstMs)} / ${formatMs(m.remainingSecondMs)}</td>
              <td>${m.legalAfter}</td>
              <td>${formatKb(rss)}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderTurnDetail(g, turn) {
  if (turn === 0) {
    return '<div class="turnDetailsInner"><b>Initial board</b><span>Chưa apply move nào. Các ô còn nguyên digit ban đầu.</span></div>';
  }
  const m = g.moves[turn - 1];
  const playerName = botNameForPlayer(g, m.player);
  const moveText = formatMove(m.move);
  const captureText = m.move.pass ? 'Pass turn' : `Rect area ${(m.move.r2 - m.move.r1 + 1) * (m.move.c2 - m.move.c1 + 1)} cells`;
  const rss = m.player === 0 ? m.memoryFirstKb : m.memorySecondKb;
  return `
    <div class="turnDetailsInner">
      <b>Turn ${turn}: ${escapeHtml(playerName)} · ${escapeHtml(moveText)}</b>
      <span>${escapeHtml(captureText)} · ${formatMs(m.elapsedMs)} · remaining F/S ${formatMs(m.remainingFirstMs)} / ${formatMs(m.remainingSecondMs)}</span>
      <span>Score ${m.scoreFirst}:${m.scoreSecond} · legal moves after turn ${m.legalAfter} · RSS ${formatKb(rss)}</span>
    </div>`;
}

function buildReplayState(game, turnCount) {
  const originals = [];
  const owners = new Array(170).fill(-1);
  for (const row of game.boardRows || []) {
    for (const ch of String(row)) originals.push(ch);
  }
  for (let i = 0; i < turnCount; i++) {
    const move = game.moves[i];
    if (!move || move.move.pass) continue;
    for (let r = move.move.r1; r <= move.move.r2; r++) {
      for (let c = move.move.c1; c <= move.move.c2; c++) {
        owners[r * 17 + c] = move.player;
      }
    }
  }
  return { originals, owners };
}

function inRect(r, c, m) {
  return r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2;
}

function botNameForPlayer(game, player) {
  if (!currentJob?.settings) return player === 0 ? 'FIRST' : 'SECOND';
  if (isTournamentJob(currentJob)) {
    const aName = getBotNameById(game.botAId);
    const bName = getBotNameById(game.botBId);
    if (game.aRole === 1) return player === 0 ? `B / FIRST · ${bName}` : `A / SECOND · ${aName}`;
    return player === 0 ? `A / FIRST · ${aName}` : `B / SECOND · ${bName}`;
  }
  const aName = shortName(currentJob.settings.botAName || 'Bot A');
  const bName = shortName(currentJob.settings.botBName || 'Bot B');
  if (game.aRole === 1) return player === 0 ? `B / FIRST · ${bName}` : `A / SECOND · ${aName}`;
  return player === 0 ? `A / FIRST · ${aName}` : `B / SECOND · ${bName}`;
}

function appendEvents(events) {
  const lines = events.map(e => {
    const t = new Date(e.time).toLocaleTimeString();
    if (e.type === 'game_start') {
      const role = e.aRole === 1 ? 'B FIRST / A SECOND' : 'A FIRST / B SECOND';
      return `[${t}] START Dataset ${e.datasetIndex + 1} · Game ${e.gameIndex + 1} · ${role}`;
    }
    if (e.type === 'game_done') {
      const g = e.game;
      const res = g.draw ? 'DRAW' : g.botAWon ? 'A WIN' : 'B WIN';
      return `[${t}] DONE Game ${g.gameIndex + 1}: A ${g.botAScore} - B ${g.botBScore} · ${res} · peak A ${formatKb(g.botAMaxRssKb)} · peak B ${formatKb(g.botBMaxRssKb)}`;
    }
    if (e.type === 'move') {
      const m = e.move.move;
      return `[${t}] MOVE g=${e.gameIndex + 1} ${e.move.role} ${formatMove(m)} · ${formatMs(e.move.elapsedMs)} · score ${e.move.scoreFirst}:${e.move.scoreSecond} · mem F ${formatKb(e.move.memoryFirstKb)} / S ${formatKb(e.move.memorySecondKb)}`;
    }
    if (e.type === 'simulation_start') return `[${t}] SIM ${e.simulationIndex + 1} START · ${e.mode || ''} · ${shortSeed(e.seed || '')}`;
    if (e.type === 'simulation_done') return `[${t}] SIM ${e.simulationIndex + 1} DONE · winner ${getBotNameById(e.winnerBotId)} · non-ok ${e.nonOkCount || 0}`;
    if (e.type === 'round_start') return `[${t}] ROUND ${e.roundIndex + 1} START · sim ${e.simulationIndex + 1} · pairs ${e.pairCount}`;
    if (e.type === 'round_done') return `[${t}] ROUND ${e.roundIndex + 1} DONE · sim ${e.simulationIndex + 1}`;
    if (e.type === 'match_start') return `[${t}] MATCH START sim=${e.simulationIndex + 1} ${getBotNameById(e.botAId)} vs ${getBotNameById(e.botBId)} · ${shortSeed(e.datasetSeed || '')}`;
    if (e.type === 'match_done') return `[${t}] MATCH DONE ${getBotNameById(e.botAId)} vs ${getBotNameById(e.botBId)} · ${formatNumber(e.scoreA)}:${formatNumber(e.scoreB)} · ${e.classificationA}`;
    if (e.type === 'tournament_start') return `[${t}] TOURNAMENT START ${e.mode} · bots ${e.botCount} · sims ${e.simulationCount}`;
    if (e.type === 'tournament_done') return `[${t}] TOURNAMENT DONE ${e.mode} · matches ${e.totalMatches} · games ${e.totalGames}`;
    return `[${t}] ${JSON.stringify(e)}`;
  });
  eventsPre.textContent += lines.join('\n') + (lines.length ? '\n' : '');
  eventsPre.scrollTop = eventsPre.scrollHeight;
}

function syncSetupPreview() {
  const mode = modeSelect?.value || 'duel';
  if (mode === 'duel') {
    const datasetCount = readPositiveNumber(datasetCountInput?.value, 30);
    const botATimeLimitMs = readPositiveNumber(botATimeLimitInput?.value, 30000);
    const botBTimeLimitMs = readPositiveNumber(botBTimeLimitInput?.value, 30000);
    if (heroDatasetCount) heroDatasetCount.textContent = String(datasetCount);
    if (heroBotClocks) heroBotClocks.textContent = `${formatCompactMs(botATimeLimitMs)} / ${formatCompactMs(botBTimeLimitMs)}`;
    if (heroProcessLimit) {
      const processLimitMs = botATimeLimitMs + botBTimeLimitMs + DEFAULT_READY_TIMEOUT_MS * 2 + PROCESS_TIME_LIMIT_GRACE_MS;
      heroProcessLimit.textContent = formatCompactMs(processLimitMs);
    }
    return;
  }
  const botCount = tournamentBotsInput?.files?.length || 0;
  const simulationCount = readPositiveNumber(simulationCountInput?.value, 20);
  const botTimeLimitMs = readPositiveNumber(tournamentBotTimeLimitInput?.value, 10000);
  if (heroDatasetCount) heroDatasetCount.textContent = `${simulationCount} sims`;
  if (heroBotClocks) heroBotClocks.textContent = formatCompactMs(botTimeLimitMs);
  if (heroProcessLimit) heroProcessLimit.textContent = formatCompactMs(botTimeLimitMs * 2 + DEFAULT_READY_TIMEOUT_MS * 2 + PROCESS_TIME_LIMIT_GRACE_MS);
  if (tournamentBotsName && botCount && !tournamentBotsName.textContent.includes('selected')) syncTournamentBotNames();
}

function getBotNameById(botId) {
  const bot = (currentJob?.bots || []).find(item => item.botId === botId);
  return shortName(bot?.name || botId || '?');
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${Math.round(n * 100)}%`;
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 100) return String(Math.round(n));
  return n.toFixed(2).replace(/\.00$/, '');
}

function formatSigned(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

function describeTournamentProgress(progress) {
  const sim = Number.isInteger(progress.simulationIndex) ? `sim ${progress.simulationIndex + 1}` : '';
  const round = Number.isInteger(progress.roundIndex) ? `round ${progress.roundIndex + 1}` : '';
  const match = Number.isInteger(progress.matchIndex) ? `match ${progress.matchIndex + 1}` : '';
  const game = Number.isInteger(progress.gameIndex) ? `game ${progress.gameIndex + 1}` : '';
  const detail = [sim, round, match, game].filter(Boolean).join(' · ') || (progress.current || 'waiting');
  const title = progress.phase || 'queued';
  return { title, detail };
}

function readPositiveNumber(value, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function shortName(name) {
  const clean = String(name || '').replace(/^A_/, '').replace(/^B_/, '');
  if (clean.length <= 26) return clean;
  return clean.slice(0, 12) + '…' + clean.slice(-10);
}

function shortSeed(seed) {
  const s = String(seed || '');
  if (s.length <= 26) return s;
  return s.slice(0, 14) + '…' + s.slice(-8);
}

function maxDefined(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}

function formatKb(kb) {
  const n = Number(kb);
  if (!Number.isFinite(n) || n <= 0) return 'n/a';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} GiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} MiB`;
  return `${Math.round(n)} KiB`;
}

function formatMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return 'n/a';
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}

function formatCompactMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return 'n/a';
  if (n >= 1000 && n % 1000 === 0) return `${Math.round(n / 1000)}s`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

function formatMove(m) {
  if (!m || m.pass) return 'PASS';
  return `${m.r1} ${m.c1} ${m.r2} ${m.c2}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}
