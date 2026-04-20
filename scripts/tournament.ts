/**
 * Persona tournament harness.
 *
 * Runs N seeded all-AI games across every pair of UtilityBT personas (and
 * mirror matches), prints per-persona win rates and average score.
 *
 * Usage:
 *   bun run scripts/tournament.ts [numGames=20] [numPlayers=2]
 */

import { getRegistry, type CardRegistry } from "../src/engine/cardRegistry";
import { SimController } from "../src/game/SimController";
import { personaNames } from "../src/ai/personas";
import type { SeatConfig } from "../src/game/seat";

async function loadRegistry(): Promise<CardRegistry> {
  const dataUrl = `file://${process.cwd()}/public/data`;
  return await getRegistry(dataUrl);
}

interface MatchupResult {
  seats: string[];
  games: number;
  wins: number[];
  totalScore: number[];
}

async function runMatch(
  seats: SeatConfig[],
  numGames: number,
  registry: CardRegistry,
  baseSeed: number,
): Promise<MatchupResult> {
  const n = seats.length;
  const wins = new Array(n).fill(0);
  const totalScore = new Array(n).fill(0);

  for (let g = 0; g < numGames; g++) {
    const seed = baseSeed + g * 997;
    const sim = new SimController({ numPlayers: n, seed, seats }, registry);
    await sim.init();
    await sim.runToEnd();
    const scores = sim.getScores();
    if (scores.length !== n) {
      throw new Error(`Expected ${n} scores, got ${scores.length}`);
    }
    const max = Math.max(...scores);
    const winners = scores
      .map((s, i) => (s === max ? i : -1))
      .filter((i) => i >= 0);
    // Split the win across ties so totals sum to numGames
    const share = 1 / winners.length;
    for (const i of winners) wins[i] += share;
    for (let i = 0; i < n; i++) totalScore[i] += scores[i];
  }

  return {
    seats: seats.map(describeSeat),
    games: numGames,
    wins,
    totalScore,
  };
}

function describeSeat(s: SeatConfig): string {
  if (s.kind === "utilityBt") return `utilityBt:${s.persona}`;
  if (s.kind === "onnx") return "onnx";
  return "human";
}

function pct(x: number, total: number): string {
  return ((x / total) * 100).toFixed(1) + "%";
}

async function main() {
  const args = process.argv.slice(2);
  const numGames = parseInt(args[0] ?? "20", 10);
  const numPlayers = parseInt(args[1] ?? "2", 10);

  console.log(
    `Tournament: ${numGames} games/matchup, ${numPlayers} players/game`,
  );
  console.log(`Personas: ${personaNames.join(", ")}\n`);

  const registry = await loadRegistry();

  // Per-persona aggregates across all matches it appears in
  const perPersona: Record<
    string,
    { games: number; winShare: number; totalScore: number }
  > = {};
  for (const p of personaNames) {
    perPersona[p] = { games: 0, winShare: 0, totalScore: 0 };
  }

  const pairings: string[][] = [];
  for (let i = 0; i < personaNames.length; i++) {
    for (let j = i; j < personaNames.length; j++) {
      const seatsArr: string[] = [personaNames[i], personaNames[j]];
      while (seatsArr.length < numPlayers) {
        seatsArr.push(personaNames[j]);
      }
      pairings.push(seatsArr);
    }
  }

  console.log("Matchup results (wins / games, avg score):");
  console.log("=".repeat(60));

  for (const personaSeq of pairings) {
    const seats: SeatConfig[] = personaSeq.map((p) => ({
      kind: "utilityBt" as const,
      persona: p,
    }));
    const res = await runMatch(seats, numGames, registry, 42);

    const summary = res.seats
      .map(
        (s, i) =>
          `${s}: ${res.wins[i].toFixed(1)}/${numGames} (${pct(
            res.wins[i],
            numGames,
          )}) avg=${(res.totalScore[i] / numGames).toFixed(1)}`,
      )
      .join("  |  ");
    console.log(summary);

    for (let i = 0; i < personaSeq.length; i++) {
      const p = personaSeq[i];
      perPersona[p].games += numGames;
      perPersona[p].winShare += res.wins[i];
      perPersona[p].totalScore += res.totalScore[i];
    }
  }

  console.log("\nPer-persona totals (across all matchups):");
  console.log("=".repeat(60));
  for (const p of personaNames) {
    const { games, winShare, totalScore } = perPersona[p];
    console.log(
      `${p.padEnd(12)}  games=${games.toString().padStart(4)}  winrate=${pct(
        winShare,
        games,
      )}  avgScore=${(totalScore / games).toFixed(1)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
