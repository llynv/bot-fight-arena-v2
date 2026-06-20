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

// --- game renderer plugins (window.ArenaGames[gameId]) ---
const loadedRenderers = new Set(['mushroom']);

function activeRenderer() {
  const id = currentJob?.gameId || 'mushroom';
  const games = window.ArenaGames || {};
  return games[id] || games.mushroom;
}

function scoreNoun() {
  return gamesMeta[currentJob?.gameId]?.display?.scoreNoun
    || activeRenderer()?.meta?.scoreNoun || 'pts';
}

const gameSelect = document.getElementById('gameSelect');
const gameSelectField = document.getElementById('gameSelectField');
const heroBoard = document.getElementById('heroBoard');
const heroEyebrow = document.getElementById('heroEyebrow');
const gamesMeta = {}; // gameId -> { id, name, display:{cols,rows,boardLabel,scoreNoun}, timing }

function selectedGameId() {
  return gameSelect?.value || 'mushroom';
}

// Drive generic UI labels (board size, score noun, eyebrow) from the selected
// game's registry metadata — nothing is hardcoded to a specific game.
function gameMeta(id) {
  return gamesMeta[id || selectedGameId()] || null;
}
function gameBoardLabel(id) {
  const d = gameMeta(id)?.display || {};
  return d.boardLabel || (d.rows && d.cols ? `${d.rows}×${d.cols}` : '—');
}
function gameScoreNoun(id) {
  return gameMeta(id)?.display?.scoreNoun || activeRenderer()?.meta?.scoreNoun || 'pts';
}
function applyGameMeta() {
  const meta = gameMeta();
  if (heroBoard) heroBoard.textContent = gameBoardLabel();
  if (heroEyebrow) heroEyebrow.textContent = `// ${meta ? meta.name : 'Local'} Arena · ${gameBoardLabel()}`;
}

// Populate the game picker from the server registry. Hidden when only one game
// exists, shown automatically once a second game is registered.
async function loadGames() {
  try {
    const res = await fetch('/api/games');
    if (!res.ok) return;
    const { games = [], defaultGameId } = await res.json();
    for (const g of games) gamesMeta[g.id] = g;
    if (!games.length || !gameSelect) { applyGameMeta(); return; }
    gameSelect.innerHTML = games.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    gameSelect.value = defaultGameId || games[0].id;
    if (games.length > 1) gameSelectField?.classList.remove('hidden');
    applyGameMeta();
    syncSetupPreview();
    await Promise.all(games.map(g => ensureRenderer(g.id)));
  } catch (_) { applyGameMeta(); /* single-game default still works */ }
}

// Lazily inject a game's renderer the first time we see its gameId, so a new
// game needs only public/games/<id>/renderer.js — no index.html edit.
function ensureRenderer(gameId) {
  return new Promise(resolve => {
    const games = window.ArenaGames || {};
    if (!gameId || games[gameId] || loadedRenderers.has(gameId)) return resolve();
    loadedRenderers.add(gameId);
    const script = document.createElement('script');
    script.src = `/games/${gameId}/renderer.js`;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}
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
gameSelect?.addEventListener('change', () => { applyGameMeta(); syncSetupPreview(); });
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
loadGames();

// --- view router ---
const navButtons = Array.from(document.querySelectorAll('.navBtn'));
const topLiveDot = document.getElementById('topLiveDot');
const topStatusText = document.getElementById('topStatusText');
function showView(name) {
  // duel + tournament render into the same results container; nav highlights which.
  const viewId = (name === 'duel' || name === 'tournament') ? 'results' : name;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${viewId}`));
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}
navButtons.forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
function setRunnerState(running, text) {
  if (topLiveDot) topLiveDot.classList.toggle('running', !!running);
  if (topStatusText && text != null) topStatusText.textContent = text;
}

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
  // Only the .cpp sources are required in duel mode; data.bin is always optional.
  for (const el of [botAInput, botBInput]) {
    if (el) { el.required = isDuel; el.disabled = !isDuel; }
  }
  for (const el of [botADataInput, botBDataInput]) {
    if (el) { el.required = false; el.disabled = !isDuel; }
  }
  // Disable the inactive mode's file input so hidden fields don't submit
  // (otherwise tournament "bots" files leak into the duel 4-file limit).
  if (tournamentBotsInput) tournamentBotsInput.disabled = isDuel;
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
    fd.set('gameId', selectedGameId());
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
    setRunnerState(true, 'RUNNING');
    showView(duelMode ? 'duel' : 'tournament');
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
  document.querySelectorAll('.viewEmpty').forEach(e => e.classList.add('hidden'));
  const navCmp = document.getElementById('navCompare');
  if (navCmp) navCmp.style.display = 'none'; // shown only for tournaments
  statusCard.classList.remove('hidden');
  standingsCard.classList.remove('hidden');
  gamesCard.classList.remove('hidden');
  eventsCard.classList.remove('hidden');
  inspectorCard.classList.remove('hidden');
  standingsBox.classList.remove('hidden');
  tournamentStandingsWrap.classList.add('hidden');
  tournamentAnalyticsChart.classList.add('hidden');
  document.getElementById('arenaReliability')?.classList.add('hidden');
  document.getElementById('stabilityScatter')?.classList.add('hidden');
  document.getElementById('overallAnalysis')?.classList.add('hidden');
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
  setRunnerState(false, 'ERROR');
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
  await ensureRenderer(job.gameId);
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
    setRunnerState(false, job.status === 'error' ? 'ERROR' : 'IDLE · job complete');
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
  if (['queued', 'compiling', 'running'].includes(job.status)) setRunnerState(true, `RUNNING · ${pct}%`);

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
  if (['queued', 'compiling', 'running'].includes(job.status)) setRunnerState(true, `RUNNING · ${pct}%`);

  datasetGroups.classList.add('hidden');
  tournamentViews.classList.remove('hidden');
  standingsBox.classList.add('hidden');
  tournamentStandingsWrap.classList.remove('hidden');
  tournamentAnalyticsChart.classList.remove('hidden');

  const standings = job.summary?.standings || [];
  rebuildBotColorMap(standings);
  reliabilityEl?.classList.remove('hidden');
  scatterEl?.classList.remove('hidden');
  overallEl?.classList.remove('hidden');
  renderTournamentSummary(job, analytics);
  renderTournamentDiagnostics(job, analytics);
  renderArenaReliability(analytics, job.settings);
  renderStabilityScatter(standings);
  renderTournamentAnalyticsChart(standings);
  renderTournamentStandings(standings);
  renderOverallAnalysis(standings);
  syncCompareControls(standings);
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

// Stable per-bot accent palette (design oklch tags). Assigned by standings rank
// so the strongest bot is gold, etc. Generic — independent of game.
const BOT_PALETTE = [
  'oklch(0.8 0.14 72)',   // gold
  'oklch(0.78 0.1 205)',  // cyan
  'oklch(0.78 0.13 150)', // green
  'oklch(0.7 0.18 330)',  // magenta
  'oklch(0.75 0.16 45)',  // orange
  'oklch(0.72 0.14 280)', // purple
  'oklch(0.8 0.13 110)',  // lime
  'oklch(0.75 0.12 230)'  // blue
];
let botColorMap = {};
function rebuildBotColorMap(standings) {
  botColorMap = {};
  standings.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99)).forEach((r, i) => {
    botColorMap[r.botId] = BOT_PALETTE[i % BOT_PALETTE.length];
  });
}
function botColor(botId) { return botColorMap[botId] || 'oklch(0.78 0.1 205)'; }
function botTag(row, idx) {
  const base = String(row.tag || row.name || '').replace(/^A_|^B_/, '').replace(/\.cpp$/i, '');
  return base.slice(0, 4).toUpperCase() || `B${idx + 1}`;
}

const reliabilityEl = document.getElementById('arenaReliability');
const scatterEl = document.getElementById('stabilityScatter');
const overallEl = document.getElementById('overallAnalysis');

// ARENA RELIABILITY — global ok vs non-ok breakdown + segmented bar.
function renderArenaReliability(analytics, settings) {
  if (!reliabilityEl) return;
  const g = analytics || {};
  const total = g.totalGames || 0;
  const ok = g.finishedGames || 0;
  const timeout = g.timeoutCount || 0;
  const invalid = g.invalidCount || 0;
  const procExit = g.processExitCount || 0;
  const procLimit = g.processLimitCount || 0;
  const crash = g.crashCount || 0;
  const okPct = total ? (ok / total * 100) : 0;
  const cells = [
    { label: 'TOTAL GAMES', value: total, color: 'var(--text)' },
    { label: 'CLEAN OK', value: ok, color: 'var(--good)' },
    { label: 'NON-OK', value: g.nonOkGames || 0, color: (g.nonOkGames ? 'var(--bad)' : 'var(--muted)') },
    { label: 'TIMEOUT/TLE', value: timeout, color: timeout ? 'var(--bad)' : 'var(--muted)' },
    { label: 'INVALID MOVE', value: invalid, color: invalid ? 'oklch(0.75 0.16 45)' : 'var(--muted)' },
    { label: 'CRASH/EXIT', value: crash + procExit + procLimit, color: (crash + procExit + procLimit) ? 'oklch(0.72 0.14 280)' : 'var(--muted)' }
  ];
  const segs = [
    { n: ok, c: 'var(--good)' },
    { n: timeout, c: 'var(--bad)' },
    { n: invalid, c: 'oklch(0.75 0.16 45)' },
    { n: procExit + procLimit + crash, c: 'oklch(0.72 0.14 280)' }
  ].filter(s => s.n > 0);
  const segTotal = segs.reduce((s, x) => s + x.n, 0) || 1;
  reliabilityEl.innerHTML = `
    <div class="dashHead"><span class="dashLabel">ARENA RELIABILITY</span><span class="dashHint">you can't build the strongest bot — only the most stable one · ${okPct.toFixed(1)}% clean</span></div>
    <div class="relGrid">
      ${cells.map(c => `<div class="relCell"><div class="relCellLabel">${c.label}</div><div class="relCellValue" style="color:${c.color}">${c.value}</div></div>`).join('')}
    </div>
    <div class="relBarWrap"><div class="relBar">
      ${segs.map(s => `<div class="relSeg" style="width:${(s.n / segTotal * 100).toFixed(2)}%;background:${s.c}"></div>`).join('')}
    </div></div>`;
}

// STABILITY × STRENGTH scatter — x = match win% (strength), y = margin swing
// stddev (lower = more stable). Ship zone = bottom-right (strong + stable).
function renderStabilityScatter(standings) {
  if (!scatterEl) return;
  if (!standings.length) { scatterEl.innerHTML = ''; return; }
  const maxStd = Math.max(0.0001, ...standings.map(r => Number(r.marginStdDev) || 0));
  const dots = standings.map((r, i) => {
    const x = Math.max(2, Math.min(98, (r.matchWinPct || 0) * 100));
    const yFromTop = Math.max(3, Math.min(94, ((Number(r.marginStdDev) || 0) / maxStd) * 100));
    const c = botColor(r.botId);
    const tag = botTag(r, i);
    return { x, yFromTop, c, tag, name: r.name };
  });
  scatterEl.innerHTML = `
    <div class="dashHead"><span class="dashLabel">STABILITY × STRENGTH</span><span class="dashHint">↗ ideal: high win-rate, low swing · ship from the bottom-right</span></div>
    <div class="scatterBody">
      <div class="scatterYAxis">← MORE STABLE&nbsp;·&nbsp;MARGIN SWING&nbsp;·&nbsp;WILDER →</div>
      <div class="scatterMain">
        <div class="scatterPlot">
          <div class="shipZone"></div>
          <div class="shipZoneLabel">SHIP ZONE</div>
          ${dots.map(d => `<div class="scatterDot" style="left:${d.x}%;top:${d.yFromTop}%;background:${d.c}" title="${escapeHtml(d.name)}"></div>`).join('')}
          ${dots.map(d => `<div class="scatterLabel" style="left:${d.x}%;top:${d.yFromTop}%;color:${d.c}">${escapeHtml(d.tag)}</div>`).join('')}
        </div>
        <div class="scatterXAxis"><span>← WEAKER</span><span>WIN-RATE (STRENGTH)</span><span>STRONGER →</span></div>
      </div>
    </div>`;
}

// OVERALL ANALYSIS — full per-bot breakdown incl. EXP·PTS, sweep, turn-order, form.
function renderOverallAnalysis(standings) {
  if (!overallEl) return;
  if (!standings.length) { overallEl.innerHTML = ''; return; }
  const rows = standings.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const noun = scoreNoun();
  const body = rows.map((r, i) => {
    const c = botColor(r.botId);
    const form = (r.form || []).map(f => {
      const col = f === 'W' ? 'var(--good)' : f === 'L' ? 'var(--bad)' : 'var(--draw)';
      return `<span class="formPip" style="background:${col}">${f}</span>`;
    }).join('') || '<span class="muted">—</span>';
    return `<tr>
      <td class="ovRank">${r.rank || i + 1}</td>
      <td><span class="ovName"><span class="ovDot" style="background:${c}"></span>${escapeHtml(r.name)}</span></td>
      <td style="color:${c}">${escapeHtml(botTag(r, i))}</td>
      <td>${r.matchesPlayed || 0}</td>
      <td class="ovGood">${r.matchWins || 0}</td>
      <td>${r.matchDraws || 0}</td>
      <td class="ovBad">${r.matchLosses || 0}</td>
      <td>${formatPct(r.matchWinPct)}</td>
      <td class="ovScore">${formatNumber(r.matchScoreTotal)}</td>
      <td class="ovElo">${formatNumber(r.eloAverage)}</td>
      <td class="ovGood">${r.gameWins || 0}</td>
      <td class="ovBad">${r.gameLosses || 0}</td>
      <td>${formatNumber(r.avgCellsDiff)}</td>
      <td class="ovExp" style="color:${c}">${formatNumber(r.expPtsPerMatch)}</td>
      <td class="ovGood">${formatPct(r.sweptPct)}</td>
      <td class="ovBad">${formatPct(r.sweptAgainstPct)}</td>
      <td>${formatPct(r.firstWinPct)}</td>
      <td>${formatPct(r.secondWinPct)}</td>
      <td><span class="formRow">${form}</span></td>
      <td><button type="button" class="detailBtn" data-detail="${escapeHtml(r.botId)}">DETAILS ↗</button></td>
    </tr>`;
  }).join('');
  overallEl.innerHTML = `
    <div class="dashHead"><span class="dashLabel">OVERALL ANALYSIS</span><span class="dashHint">full per-bot breakdown · scroll horizontally →</span></div>
    <div class="tableScroll">
      <table class="standingsTable overallTable">
        <thead><tr>
          <th>#</th><th>BOT</th><th>TAG</th><th>P</th><th>W</th><th>D</th><th>L</th><th>WIN%</th><th>SCORE</th><th>ELO</th><th>GW</th><th>GL</th><th>AVG ${escapeHtml(noun)}</th><th>EXP·PTS</th><th>2.0%</th><th>0.0%</th><th>1ST%</th><th>2ND%</th><th>FORM</th><th>ANALYZE</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="dashFoot">EXP·PTS = avg points / match · 2.0% = swept (won both sides) · 0.0% = swept against · 1ST/2ND% = win-rate by turn order · AVG = mean ${escapeHtml(noun)} margin per match</div>`;
}

// ===== Per-bot performance-analysis MODAL =====
const detailOverlay = document.getElementById('detailOverlay');
const detailModal = document.getElementById('detailModal');

function openDetail(botId) {
  const standings = currentJob?.summary?.standings || [];
  const r = standings.find(x => x.botId === botId);
  if (!r || !detailModal) return;
  rebuildBotColorMap(standings);
  const c = botColor(botId);
  const noun = scoreNoun();
  const played = r.matchesPlayed || 0;
  const gp = r.gamesPlayed || 0;
  const pw = r.gameWinPct || 0;
  const ci = gp ? Math.round(1.96 * Math.sqrt(pw * (1 - pw) / gp) * 100) : 0;

  const dist = [
    { pts: '2.0', desc: 'Sweep · won both sides', key: '2.0' },
    { pts: '1.5', desc: 'Win + draw', key: '1.5' },
    { pts: '1.0', desc: 'Split · or two draws', key: '1.0' },
    { pts: '0.5', desc: 'Draw + loss', key: '0.5' },
    { pts: '0.0', desc: 'Swept · lost both', key: '0.0' }
  ].map(d => ({ ...d, count: (r.matchScoreDist || {})[d.key] || 0 }));
  const maxc = Math.max(1, ...dist.map(d => d.count));
  const distHtml = dist.map(d => `
    <div class="distRow">
      <div class="distPts" style="color:${c}">${d.pts}</div>
      <div class="distDesc">${d.desc}</div>
      <div class="distTrack"><div class="distFill" style="width:${Math.max(2, Math.round(d.count / maxc * 100))}%;background:${c}"></div></div>
      <div class="distPct">${played ? Math.round(d.count / played * 100) : 0}%</div>
      <div class="distCount">×${d.count}</div>
    </div>`).join('');

  const wdl = [
    { l: 'WIN', p: r.gameWinPct || 0, col: 'var(--good)' },
    { l: 'DRAW', p: r.gameDrawPct || 0, col: 'var(--muted)' },
    { l: 'LOSS', p: r.gameLossPct || 0, col: 'var(--bad)' }
  ].map(x => `<div class="pgRow"><div class="pgTop"><span style="color:${x.col}">${x.l}</span><span>${formatPct(x.p)}</span></div><div class="pgTrack"><div class="pgFill" style="width:${Math.round(x.p * 100)}%;background:${x.col}"></div></div></div>`).join('');

  const samples = r.gameScoreSamples || [];
  let histHtml = '<div class="muted" style="padding:10px 0">no game samples</div>';
  if (samples.length) {
    const mn = Math.min(...samples), mx = Math.max(...samples);
    const span = Math.max(1, mx - mn), nb = 4, counts = Array(nb).fill(0);
    samples.forEach(s => { counts[Math.min(nb - 1, Math.floor((s - mn) / span * nb))]++; });
    const mxc = Math.max(1, ...counts);
    histHtml = counts.map((cnt, i) => {
      const lo = Math.round(mn + span / nb * i), hi = Math.round(mn + span / nb * (i + 1));
      return `<div class="histCol"><span class="histPct">${Math.round(cnt / samples.length * 100)}%</span><div class="histBar" style="height:${Math.round(cnt / mxc * 64 + 8)}px;background:${c}"></div><span class="histLabel">${lo}–${hi}</span></div>`;
    }).join('');
  }

  const okGames = gp - (r.nonOkCount || 0);
  const reli = [['OK', okGames, 'var(--good)'], ['TLE', r.timeoutCount || 0, 'var(--bad)'], ['ILLEGAL', r.invalidCount || 0, 'oklch(0.75 0.16 45)'], ['CRASH', (r.crashCount || 0) + (r.processExitCount || 0) + (r.processLimitCount || 0), 'oklch(0.72 0.14 280)']];
  const reliMax = Math.max(1, ...reli.map(x => x[1]));
  const reliHtml = reli.map(([l, n, col]) => `<div class="pgRow"><div class="pgTop"><span style="color:${col}">${l}</span><span>${n}</span></div><div class="pgTrack"><div class="pgFill" style="width:${Math.round(n / reliMax * 100)}%;background:${col}"></div></div></div>`).join('');

  const opps = Object.entries(r.opponents || {}).map(([oid, o]) => `<tr><td>${escapeHtml(getBotNameById(oid))}</td><td class="ovGood">${o.wins}</td><td>${o.draws}</td><td class="ovBad">${o.losses}</td><td>${o.matches}</td><td>${formatNumber(o.cellsDiffTotal)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">no opponents</td></tr>';

  const form = (r.form || []).map(f => { const col = f === 'W' ? 'var(--good)' : f === 'L' ? 'var(--bad)' : 'var(--draw)'; return `<span class="formPip" style="background:${col}">${f}</span>`; }).join('') || '<span class="muted">—</span>';

  detailModal.innerHTML = `
    <div class="modalHead">
      <span class="ovDot" style="background:${c};width:12px;height:12px"></span>
      <div><div class="modalName">${escapeHtml(r.name)}</div><div class="modalSub">PERFORMANCE ANALYSIS · ${played} MATCHES</div></div>
      <span class="modalTag" style="color:${c}">${escapeHtml(botTag(r, (r.rank || 1) - 1))}</span>
      <button type="button" class="modalClose" id="detailClose">×</button>
    </div>
    <div class="modalStats">
      <div class="mStat"><div class="mStatLabel">RANK</div><div class="mStatVal">#${r.rank || '-'}</div></div>
      <div class="mStat"><div class="mStatLabel">ELO</div><div class="mStatVal" style="color:${c}">${formatNumber(r.eloAverage)}</div></div>
      <div class="mStat"><div class="mStatLabel">SCORE</div><div class="mStatVal">${formatNumber(r.matchScoreTotal)}</div></div>
      <div class="mStat"><div class="mStatLabel">WIN%</div><div class="mStatVal">${formatPct(r.matchWinPct)} <small style="color:${c}">±${ci}</small></div><div class="mStatFoot">N = ${gp} games</div></div>
      <div class="mStat"><div class="mStatLabel">EXP PTS/MATCH</div><div class="mStatVal" style="color:${c}">${formatNumber(r.expPtsPerMatch)}</div></div>
    </div>
    <div class="modalBody">
      <div class="modalSecLabel">MATCH POINT DISTRIBUTION <span class="muted">· probability per 2-game match</span></div>
      <div class="distList">${distHtml}</div>
      <div class="modalCols">
        <div>
          <div class="modalSecLabel">PER-GAME OUTCOME</div>
          ${wdl}
        </div>
        <div>
          <div class="modalSecLabel">SCORE PER GAME <span class="muted">· ${escapeHtml(noun)}</span></div>
          <div class="histWrap">${histHtml}</div>
        </div>
      </div>
      <div class="modalCols">
        <div>
          <div class="modalSecLabel">MOVE ADVANTAGE</div>
          <div class="pgRow"><div class="pgTop"><span>WIN% AS FIRST</span><span>${formatPct(r.firstWinPct)}</span></div><div class="pgTrack"><div class="pgFill" style="width:${Math.round((r.firstWinPct || 0) * 100)}%;background:${c}"></div></div></div>
          <div class="pgRow"><div class="pgTop"><span>WIN% AS SECOND</span><span>${formatPct(r.secondWinPct)}</span></div><div class="pgTrack"><div class="pgFill" style="width:${Math.round((r.secondWinPct || 0) * 100)}%;background:${c}"></div></div></div>
          <div class="modalSecLabel" style="margin-top:16px">RECENT FORM</div>
          <div class="formRow">${form}</div>
        </div>
        <div>
          <div class="modalSecLabel">RELIABILITY</div>
          ${reliHtml}
        </div>
      </div>
      <div class="modalSecLabel">BY OPPONENT</div>
      <div class="tableScroll"><table class="standingsTable byOppTable"><thead><tr><th>OPPONENT</th><th>W</th><th>D</th><th>L</th><th>MATCHES</th><th>NET ${escapeHtml(noun).toUpperCase()}</th></tr></thead><tbody>${opps}</tbody></table></div>
    </div>`;
  detailOverlay.classList.remove('hidden');
  document.getElementById('detailClose')?.addEventListener('click', closeDetail);
}
function closeDetail() { detailOverlay?.classList.add('hidden'); }
detailOverlay?.addEventListener('click', e => { if (e.target === detailOverlay) closeDetail(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && detailOverlay && !detailOverlay.classList.contains('hidden')) closeDetail(); });
document.getElementById('overallAnalysis')?.addEventListener('click', e => {
  const b = e.target.closest('button[data-detail]');
  if (b) openDetail(b.dataset.detail);
});

// ===== Version compare (bot-vs-bot head-to-head from tournament data) =====
const compareASel = document.getElementById('compareA');
const compareBSel = document.getElementById('compareB');
const compareBody = document.getElementById('compareBody');
const navCompare = document.getElementById('navCompare');
let compareA = null, compareB = null;

function syncCompareControls(standings) {
  if (!compareASel || !compareBSel) return;
  if (navCompare) navCompare.style.display = standings.length >= 2 ? 'inline-block' : 'none';
  if (standings.length < 2) { compareBody.innerHTML = '<div class="viewEmpty emptyState">Run a tournament with 2+ bots, then pick two to compare.</div>'; return; }
  const opts = standings.map(r => `<option value="${escapeHtml(r.botId)}">${escapeHtml(r.name)}</option>`).join('');
  const validA = standings.some(r => r.botId === compareA);
  const validB = standings.some(r => r.botId === compareB);
  if (!validA) compareA = standings[0].botId;
  if (!validB) compareB = standings[1].botId;
  compareASel.innerHTML = opts; compareASel.value = compareA;
  compareBSel.innerHTML = opts; compareBSel.value = compareB;
  renderCompare();
}

function deltaCell(label, value, sub, positiveGood = true) {
  const n = Number(value) || 0;
  const col = n === 0 ? 'var(--muted)' : ((n > 0) === positiveGood ? 'var(--good)' : 'var(--bad)');
  const sign = n > 0 ? '+' : '';
  return `<div class="deltaCell"><div class="deltaLabel">${label}</div><div class="deltaVal" style="color:${col}">${sign}${typeof value === 'string' ? value : formatNumber(n)}</div><div class="deltaSub">${sub}</div></div>`;
}

let comparePair = null; // { key, games:[{seed,aScore,bScore,status}] }
let comparePairSeq = 0;

// Fetch the head-to-head game history for the two selected bots and orient every
// game to bot A's perspective, so the per-seed diff reads consistently.
async function loadComparePair(aId, bId) {
  if (!currentJobId) return;
  const key = `${aId}::${bId}`;
  if (comparePair && comparePair.key === key) { renderCompare(); return; }
  const seq = ++comparePairSeq;
  try {
    const res = await fetch(`/api/jobs/${currentJobId}/pairs/${encodeURIComponent(aId)}/${encodeURIComponent(bId)}`);
    const data = await res.json();
    if (seq !== comparePairSeq) return;
    const games = [];
    for (const m of (data.matches || [])) {
      const aIsMatchA = m.botAId === aId;
      for (const g of (m.games || [])) {
        games.push({
          seed: g.seed,
          aScore: aIsMatchA ? g.botAScore : g.botBScore,
          bScore: aIsMatchA ? g.botBScore : g.botAScore,
          status: g.status
        });
      }
    }
    comparePair = { key, games };
  } catch (_) {
    comparePair = { key, games: [] };
  }
  renderCompare();
}

function renderCompare() {
  if (!compareBody || !currentJob || !isTournamentJob(currentJob)) return;
  const standings = currentJob.summary?.standings || [];
  const A = standings.find(r => r.botId === compareA);
  const B = standings.find(r => r.botId === compareB);
  if (!A || !B) { compareBody.innerHTML = '<div class="viewEmpty emptyState">Pick two distinct bots.</div>'; return; }
  if (A.botId === B.botId) { compareBody.innerHTML = '<div class="viewEmpty emptyState">Pick two <b>distinct</b> bots.</div>'; return; }
  const key = `${A.botId}::${B.botId}`;
  if (!comparePair || comparePair.key !== key) { loadComparePair(A.botId, B.botId); }
  rebuildBotColorMap(standings);
  const cA = botColor(A.botId), cB = botColor(B.botId);
  const noun = scoreNoun();
  const winDelta = (B.matchWinPct - A.matchWinPct) * 100;
  const marginDelta = B.avgCellsDiff - A.avgCellsDiff;
  const tleDelta = (B.timeoutCount || 0) - (A.timeoutCount || 0);

  // per-seed head-to-head (A perspective)
  const games = (comparePair && comparePair.key === key) ? comparePair.games : [];
  let aWins = 0, bWins = 0, draws = 0, netCells = 0;
  const rows = games.map(g => {
    const d = (g.aScore || 0) - (g.bScore || 0);
    netCells += d;
    const out = d > 0 ? 'W' : d < 0 ? 'L' : 'D';
    if (d > 0) aWins++; else if (d < 0) bWins++; else draws++;
    const shiftCls = d > 0 ? 'shiftGain' : d < 0 ? 'shiftLoss' : '';
    const shiftTxt = d > 0 ? '▲ A' : d < 0 ? '▼ B' : '·';
    return `<tr class="${d !== 0 ? 'seedFlip ' + shiftCls : ''}">
      <td class="seedCell">${escapeHtml(shortSeed(g.seed))}</td>
      <td><span style="color:${d > 0 ? cA : d < 0 ? cB : 'var(--muted)'};font-weight:700">${out}</span> <span class="muted">${g.aScore || 0}</span></td>
      <td><span style="color:${d < 0 ? cB : d > 0 ? cA : 'var(--muted)'};font-weight:700">${out === 'W' ? 'L' : out === 'L' ? 'W' : 'D'}</span> <span class="muted">${g.bScore || 0}</span></td>
      <td style="color:${d > 0 ? 'var(--good)' : d < 0 ? 'var(--bad)' : 'var(--muted)'}">${d > 0 ? '+' : ''}${d}</td>
      <td><span class="${shiftCls}">${shiftTxt}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="muted">Loading head-to-head games…</td></tr>';

  const netA = aWins - bWins;
  const better = netA > 0 ? A : netA < 0 ? B : null;
  const verdictCol = better ? botColor(better.botId) : 'var(--muted)';
  const verdict = better ? `${shortName(better.name).toUpperCase()} WINS HEAD-TO-HEAD` : 'DEAD HEAT';
  const verdictSub = games.length
    ? `${aWins > bWins ? '+' + (aWins - bWins) : aWins < bWins ? '+' + (bWins - aWins) : '0'} net seed wins for ${better ? shortName(better.name) : 'neither'} · ${games.length} shared games · net ${netCells >= 0 ? '+' : ''}${netCells} ${noun}`
    : 'no shared head-to-head games yet';

  compareBody.innerHTML = `
    <div class="compareHeads">
      <div class="compareHead" style="border-color:${cA}">
        <div class="dashLabel">VERSION A</div>
        <div class="compareHeadName"><span class="ovDot" style="background:${cA}"></span>${escapeHtml(A.name)}<span class="verTag" style="color:${cA};border-color:${cA}">${escapeHtml(botTag(A, (A.rank || 1) - 1))}</span></div>
        <div class="compareRec">record on shared seeds&nbsp;&nbsp;<b>${aWins}–${draws}–${bWins}</b></div>
      </div>
      <div class="compareVsBox">vs</div>
      <div class="compareHead" style="border-color:${cB}">
        <div class="dashLabel">VERSION B</div>
        <div class="compareHeadName"><span class="verTag" style="color:${cB};border-color:${cB}">${escapeHtml(botTag(B, (B.rank || 1) - 1))}</span>${escapeHtml(B.name)}<span class="ovDot" style="background:${cB}"></span></div>
        <div class="compareRec"><b>${bWins}–${draws}–${aWins}</b>&nbsp;&nbsp;record on shared seeds</div>
      </div>
    </div>
    <div class="verdictBanner" style="border-color:${verdictCol}">
      <div class="verdictBar" style="background:${verdictCol}"></div>
      <div class="verdictMain"><div class="verdictTitle" style="color:${verdictCol}">${escapeHtml(verdict)}</div><div class="verdictSub">${escapeHtml(verdictSub)}</div></div>
      <div class="verdictRight"><div class="dashLabel">SHARED GAMES</div><div class="verdictN">${games.length}</div></div>
    </div>
    <div class="deltaGrid">
      ${deltaCell('WIN% DELTA (B − A)', winDelta.toFixed(1) + '%', `${formatPct(A.matchWinPct)} → ${formatPct(B.matchWinPct)}`, true)}
      ${deltaCell('AVG MARGIN DELTA', marginDelta, `${noun} / match`, true)}
      ${deltaCell('TLE DELTA', tleDelta, `A:${A.timeoutCount || 0} · B:${B.timeoutCount || 0} timeouts`, false)}
      <div class="deltaCell"><div class="deltaLabel">SEED OUTCOMES</div><div class="deltaVal"><span style="color:var(--good)">▲${aWins}</span> <span style="color:var(--bad)">▼${bWins}</span></div><div class="deltaSub">A wins vs B wins</div></div>
    </div>
    <div class="dashPanel" style="margin-top:14px">
      <div class="dashHead"><span class="dashLabel">PER-SEED DIFF · <span style="color:${cA}">${escapeHtml(shortName(A.name))}</span> vs <span style="color:${cB}">${escapeHtml(shortName(B.name))}</span></span><span class="dashHint">highlighted rows = A took the seed</span></div>
      <div class="tableScroll"><table class="standingsTable seedDiffTable">
        <thead><tr><th>SEED</th><th style="color:${cA}">A · ${escapeHtml(botTag(A, 0))}</th><th style="color:${cB}">B · ${escapeHtml(botTag(B, 1))}</th><th>Δ ${escapeHtml(noun).toUpperCase()}</th><th>SHIFT</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

compareASel?.addEventListener('change', () => { compareA = compareASel.value; comparePair = null; renderCompare(); });
compareBSel?.addEventListener('change', () => { compareB = compareBSel.value; comparePair = null; renderCompare(); });

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
        <th>${sortButton('rank', 'Rank')}</th><th>${sortButton('name', 'Bot')}</th><th>${sortButton('matchWinPct', 'Match W%')}</th><th>${sortButton('matchDrawPct', 'D%')}</th><th>${sortButton('matchLossPct', 'L%')}</th><th>${sortButton('gameWinPct', 'Game W%')}</th><th>${sortButton('gameDrawPct', 'D%')}</th><th>${sortButton('gameLossPct', 'L%')}</th><th>${sortButton('avgMatchScore', 'Avg match')}</th><th>${sortButton('eloCurrent', 'Elo')}</th><th>${sortButton('eloAverage', 'Elo avg')}</th><th>${sortButton('avgCellsDiff', `${scoreNoun()} avg`)}</th><th>P10/P90</th><th>${sortButton('firstWinPct', 'First W%')}</th><th>${sortButton('secondWinPct', 'Second W%')}</th><th>${sortButton('powerScore', 'Power')}</th><th>${sortButton('safetyScore', 'Safety')}</th><th>${sortButton('stabilityScore', 'Stability')}</th><th>${sortButton('nonOkRate', 'Non-ok')}</th><th>Badges</th>
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
        <span>${scoreNoun()} ${formatNumber(match.cellsDiffA)}</span>
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
                <span>${scoreNoun()} ${formatSigned(match.cellsDiffA)}</span>
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
                <span>${scoreNoun()} ${formatSigned(rowPerspective.diff)}</span>
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

let matrixMode = 'record'; // 'record' | 'fragility'

function renderPairMatrix(matrix, rows) {
  if (!rows.length) {
    pairMatrix.innerHTML = '<div class="emptyState">Chưa có pair matrix.</div>';
    return;
  }
  const ids = rows.map(row => row.botId);
  const hint = matrixMode === 'fragility' ? 'seed-to-seed swing (stable → coin-flip)' : 'head-to-head W–D–L (row vs col)';
  const modeBtn = (k, label) => `<button type="button" class="matrixModeBtn${matrixMode === k ? ' active' : ''}" data-matrix-mode="${k}">${label}</button>`;
  pairMatrix.innerHTML = `
    <div class="matrixToolbar"><span class="dashHint">· ${hint}</span><div class="matrixModes">${modeBtn('record', 'W–D–L')}${modeBtn('fragility', 'FRAGILITY')}</div></div>
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
  const active = selectedPair && selectedPair.rowId === rowId && selectedPair.colId === colId ? ' active' : '';
  if (matrixMode === 'fragility') {
    // closeness of the record = how coin-flippy this matchup is (real, no RNG)
    const decided = cell.aWins + cell.aLosses;
    const closeness = decided ? 1 - Math.abs(cell.aWins - cell.aLosses) / decided : 0;
    const lbl = closeness > 0.66 ? 'COIN' : closeness > 0.33 ? 'SWING' : 'STBL';
    const cls = closeness > 0.66 ? 'bad' : closeness > 0.33 ? 'draw' : 'neutral';
    return `<td><button class="matrixCell ${cls}${active}" type="button" data-matrix-row="${rowId}" data-matrix-col="${colId}" title="record ${cell.aWins}-${cell.draws}-${cell.aLosses} · closeness ${formatPct(closeness)}"><b>${lbl}</b><small>${cell.aWins}-${cell.draws}-${cell.aLosses}</small></button></td>`;
  }
  const avgScore = cell.matches ? cell.aScoreTotal / cell.matches : 0;
  const avgDiff = cell.matches ? cell.aCellsDiffTotal / cell.matches : 0;
  const winPct = cell.matches ? cell.aWins / cell.matches : 0;
  const cls = avgScore > 1.05 ? 'good' : avgScore < 0.95 ? 'bad' : 'draw';
  return `<td><button class="matrixCell ${cls}${active}" type="button" data-matrix-row="${rowId}" data-matrix-col="${colId}" title="wins ${cell.aWins}, draws ${cell.draws}, losses ${cell.aLosses}, non-ok ${cell.nonOk}"><b>${formatPct(winPct)} W</b><br/>avg ${formatNumber(avgScore)}<br/>${formatSigned(avgDiff)} ${scoreNoun()}<br/>n=${cell.matches}<small>${cell.aWins}-${cell.draws}-${cell.aLosses} · non-ok ${cell.nonOk}</small></button></td>`;
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
  const modeBtn = e.target.closest('button[data-matrix-mode]');
  if (modeBtn && currentJob) {
    matrixMode = modeBtn.dataset.matrixMode;
    renderPairMatrix(currentJob.summary?.pairMatrix || {}, currentJob.summary?.standings || []);
    return;
  }
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
    <div class="metric"><span>Bot A W/D/L</span><b>${s.botA.wins}/${s.botA.draws}/${s.botA.losses}</b><small>${s.botA.totalScore} total ${scoreNoun()}</small></div>
    <div class="metric"><span>Bot B W/D/L</span><b>${s.botB.wins}/${s.botB.draws}/${s.botB.losses}</b><small>${s.botB.totalScore} total ${scoreNoun()}</small></div>
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
  const played = (bot.wins || 0) + (bot.draws || 0) + (bot.losses || 0);
  const winPct = played ? bot.wins / played : 0;
  const w = played ? Math.round(bot.wins / played * 100) : 0;
  const d = played ? Math.round(bot.draws / played * 100) : 0;
  const l = Math.max(0, 100 - w - d);
  const diffText = diff > 0 ? `+${diff}` : String(diff);
  const accent = label === 'A' ? 'var(--botA)' : 'var(--botB)';
  return `
    <div class="standingCard">
      <div class="standingTop">
        <div class="standingName"><span class="avatar ${label.toLowerCase()}"></span><span>${escapeHtml(name)}</span><span class="botTagLabel" style="color:${accent}">BOT&nbsp;${label}</span></div>
        <span class="bigRate" style="color:${accent}">${formatPct(winPct)}</span>
      </div>
      <div class="wdlNums">
        <div><b class="ovGood">${bot.wins || 0}</b><small>WINS</small></div>
        <div><b>${bot.draws || 0}</b><small>DRAWS</small></div>
        <div><b class="ovBad">${bot.losses || 0}</b><small>LOSSES</small></div>
        <div class="wdlNumsDiff"><b style="color:${accent}">${diffText}</b><small>${escapeHtml(scoreNoun()).toUpperCase()} DIFF</small></div>
      </div>
      <div class="wdlBar standingBar">
        <span class="wdlSeg win" style="width:${w}%">${w >= 12 ? w + '%' : ''}</span>
        <span class="wdlSeg draw" style="width:${d}%">${d >= 12 ? d + '%' : ''}</span>
        <span class="wdlSeg loss" style="width:${l}%">${l >= 12 ? l + '%' : ''}</span>
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

  boardGrid.innerHTML = activeRenderer().renderBoard(g, selectedTurn, {
    ownerName: owner => botNameForPlayer(g, owner)
  });

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
  const captureText = activeRenderer().describeMove(m.move);
  const rss = m.player === 0 ? m.memoryFirstKb : m.memorySecondKb;
  return `
    <div class="turnDetailsInner">
      <b>Turn ${turn}: ${escapeHtml(playerName)} · ${escapeHtml(moveText)}</b>
      <span>${escapeHtml(captureText)} · ${formatMs(m.elapsedMs)} · remaining F/S ${formatMs(m.remainingFirstMs)} / ${formatMs(m.remainingSecondMs)}</span>
      <span>Score ${m.scoreFirst}:${m.scoreSecond} · legal moves after turn ${m.legalAfter} · RSS ${formatKb(rss)}</span>
    </div>`;
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
  const renderer = activeRenderer();
  if (renderer && renderer.formatMove) return renderer.formatMove(m);
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
