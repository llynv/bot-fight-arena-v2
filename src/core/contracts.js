'use strict';

/**
 * Game plugin contract for the 2-player sequential-turn arena.
 *
 * The harness (process management, time accounting, fault classification,
 * tournaments, ELO, analytics, inspector) is game-agnostic. Everything specific
 * to a game lives behind this contract. Implement a GameJudge (server) plus a
 * matching renderer (client, see public/games/<id>/renderer.js) and register the
 * id — no harness edits.
 *
 * @typedef {Object} GameJudge
 * @property {string} id                 Stable slug, e.g. "mushroom".
 * @property {string} name               Human-readable name.
 * @property {GameTiming} timing         Default budgets (overridable per job).
 * @property {(seed:string)=>Scenario} createScenario  Per-dataset input, serializable.
 * @property {GameProtocol} protocol     How bots are spoken to over stdio.
 * @property {GameRules} rules           Pure game rules.
 * @property {(result:Object, scenario:Scenario)=>Object} [summarizeExtras]
 *           Extra game-specific fields merged into a game summary (optional).
 * @property {GameDisplayMeta} [display] Hints the server exposes via GET /api/games.
 *
 * @typedef {Object} GameTiming
 * @property {number} totalTimeMs        Default per-bot clock for one game.
 * @property {number} readyTimeoutMs     Handshake reply deadline.
 * @property {number} maxPlies           Hard cap on turns before forced end.
 *
 * @typedef {Object} GameProtocol
 * @property {{first:string, second:string, expect:string}} ready
 *           Handshake line sent to each role and the exact reply expected.
 * @property {(scenario:Scenario)=>string} initMessage     Sent to both bots at start.
 * @property {(state:State, player:0|1, remaining:[number,number])=>string} turnMessage
 *           Sent to the bot on turn; remaining = [firstMs, secondMs].
 * @property {(line:string)=>{ok:boolean, move:Move, reason:string}} parseMove
 * @property {(move:Move)=>string} serializeMove           For logs and opponent echo.
 * @property {(move:Move, elapsedMs:number)=>string} opponentMessage
 *           Echoed to the opponent after a legal move.
 *
 * @typedef {Object} GameRules
 * @property {(scenario:Scenario)=>State} createState
 * @property {(state:State, move:Move, player:0|1)=>boolean} isLegal
 * @property {(state:State, move:Move, player:0|1)=>State} applyMove  Returns next state.
 * @property {(state:State, move:Move, prevMove:(Move|null))=>boolean} isTerminal
 *           True when the game ends as a result of `move`. `prevMove` is the
 *           previous ply's move (null on the first ply), e.g. pass-after-pass.
 * @property {(state:State)=>{first:number, second:number}} score
 * @property {(state:State, move:Move, player:0|1)=>Object} [moveTelemetry]
 *           Extra per-turn record fields for the inspector (optional).
 *
 * @typedef {Object} GameDisplayMeta
 * @property {string} [scoreNoun]        e.g. "cells" — label for the score metric.
 * @property {number} [cols]
 * @property {number} [rows]
 *
 * @typedef {Object} Scenario  Game-defined, serializable per-dataset input.
 * @typedef {Object} State     Game-defined mutable working state.
 * @typedef {Object} Move      Game-defined parsed move.
 */

module.exports = {};
