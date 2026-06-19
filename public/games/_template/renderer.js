'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GAME RENDERER TEMPLATE (client-side)
//
// Copy this folder to public/games/<your-game>/ and implement the board drawing.
// It self-registers on window.ArenaGames[<id>]; the generic SPA loads it lazily
// by job.gameId — no index.html edit needed for additional games.
//
// `id` MUST match the judge id in src/games/<your-game>/index.js.
// ─────────────────────────────────────────────────────────────────────────────
(function registerTemplateRenderer() {
  const id = '_template';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  // One line per move, e.g. how a move reads in the timeline.
  function formatMove(move) {
    if (!move) return 'PASS';
    return String(move.step);
  }

  // Short human description for the turn-detail panel.
  function describeMove(move) {
    if (!move) return 'No move';
    return `Subtract ${move.step}`;
  }

  // Return the innerHTML for the replay board at `turnCount`.
  // `helpers.ownerName(player)` maps a player index to a display name.
  // `game.scenario` holds whatever your judge.createScenario produced; `game.moves`
  // is the full move list (each: { player, move, scoreFirst, scoreSecond, ... }).
  function renderBoard(game, turnCount, helpers = {}) {
    const start = game.scenario?.start ?? 0;
    let remaining = start;
    for (let i = 0; i < turnCount; i++) remaining -= game.moves[i]?.move?.step || 0;
    return `<div class="boardPlaceholder">remaining: <b>${escapeHtml(remaining)}</b> / ${escapeHtml(start)}</div>`;
  }

  window.ArenaGames = window.ArenaGames || {};
  window.ArenaGames[id] = {
    meta: { scoreNoun: 'points' },
    formatMove,
    describeMove,
    renderBoard
  };
})();
