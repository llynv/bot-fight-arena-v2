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
const heroBotClocks = document.getElementById('heroBotClocks');
const heroProcessLimit = document.getElementById('heroProcessLimit');
const heroDatasetCount = document.getElementById('heroDatasetCount');

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

botAInput?.addEventListener('change', () => updateFileName(botAInput, botAName));
botBInput?.addEventListener('change', () => updateFileName(botBInput, botBName));
botADataInput?.addEventListener('change', () => updateFileName(botADataInput, botADataName, 'Không dùng data.bin'));
botBDataInput?.addEventListener('change', () => updateFileName(botBDataInput, botBDataName, 'Không dùng data.bin'));
datasetCountInput?.addEventListener('input', syncSetupPreview);
botATimeLimitInput?.addEventListener('input', syncSetupPreview);
botBTimeLimitInput?.addEventListener('input', syncSetupPreview);
datasetGroups?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-game-index]');
  if (button) selectGame(Number(button.dataset.gameIndex));
});
gameList?.addEventListener('click', (e) => {
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

syncSetupPreview();

function updateFileName(input, target, emptyText = 'Chưa chọn file') {
  const file = input.files?.[0];
  target.textContent = file ? file.name : emptyText;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  resetUiForRun();

  try {
    const fd = new FormData(form);
    const res = await fetch('/api/start', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cannot start job');
    currentJobId = data.jobId;
    eventCursor = 0;
    selectedGameIndex = null;
    selectedTurn = 0;
    currentGameDetail = null;
    exportLink.href = `/api/jobs/${currentJobId}/export.json`;
    startBtn.textContent = 'Running...';
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
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';
  statusCard.classList.remove('hidden');
  standingsCard.classList.remove('hidden');
  gamesCard.classList.remove('hidden');
  eventsCard.classList.remove('hidden');
  inspectorCard.classList.remove('hidden');
  summaryBox.innerHTML = '';
  diagnosticsBox.innerHTML = '';
  standingsBox.innerHTML = '';
  datasetGroups.innerHTML = '<div class="emptyState">Đang compile bot. Kết quả sẽ xuất hiện sau game đầu tiên.</div>';
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
  startBtn.textContent = 'Start Fight';
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
    startBtn.textContent = 'Start Fight';
    exportLink.classList.remove('hidden');
  }
}

function renderJob(job) {
  const done = job.progress?.done || 0;
  const total = job.progress?.total || 0;
  const pct = total ? Math.round(done * 100 / total) : 0;
  progressBar.style.width = `${pct}%`;

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
    const aName = shortName(settings.botAName || 'Bot A');
    const bName = shortName(settings.botBName || 'Bot B');
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
    return `[${t}] ${JSON.stringify(e)}`;
  });
  eventsPre.textContent += lines.join('\n') + (lines.length ? '\n' : '');
  eventsPre.scrollTop = eventsPre.scrollHeight;
}

function syncSetupPreview() {
  const datasetCount = readPositiveNumber(datasetCountInput?.value, 30);
  const botATimeLimitMs = readPositiveNumber(botATimeLimitInput?.value, 30000);
  const botBTimeLimitMs = readPositiveNumber(botBTimeLimitInput?.value, 30000);
  if (heroDatasetCount) heroDatasetCount.textContent = String(datasetCount);
  if (heroBotClocks) heroBotClocks.textContent = `${formatCompactMs(botATimeLimitMs)} / ${formatCompactMs(botBTimeLimitMs)}`;
  if (heroProcessLimit) {
    const processLimitMs = botATimeLimitMs + botBTimeLimitMs + DEFAULT_READY_TIMEOUT_MS * 2 + PROCESS_TIME_LIMIT_GRACE_MS;
    heroProcessLimit.textContent = formatCompactMs(processLimitMs);
  }
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
