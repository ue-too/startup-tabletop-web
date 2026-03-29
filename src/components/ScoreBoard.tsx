const PLAYER_COLORS = ['text-cyan-400', 'text-amber-400', 'text-emerald-400', 'text-purple-400'];
const PLAYER_BG = ['bg-cyan-900/40', 'bg-amber-900/40', 'bg-emerald-900/40', 'bg-purple-900/40'];

interface ScoreBoardProps {
  scores: number[];
  numPlayers: number;
}

export function ScoreBoard({ scores, numPlayers }: ScoreBoardProps) {
  const maxScore = Math.max(...scores);

  return (
    <div className="mx-auto max-w-md rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl">
      <h2 className="mb-4 text-center text-lg font-bold text-white">Final Scores</h2>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-600 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
            <th className="pb-2">Player</th>
            <th className="pb-2 text-right">Score</th>
            <th className="pb-2 text-center">Result</th>
          </tr>
        </thead>
        <tbody>
          {scores.slice(0, numPlayers).map((score, i) => {
            const isWinner = score === maxScore;
            return (
              <tr
                key={i}
                className={`border-b border-gray-700/50 ${isWinner ? PLAYER_BG[i] : ''}`}
              >
                <td className={`py-2 font-medium ${PLAYER_COLORS[i]}`}>
                  Player {i + 1}
                </td>
                <td className="py-2 text-right font-mono text-sm text-white">
                  {score}
                </td>
                <td className="py-2 text-center">
                  {isWinner && (
                    <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-bold text-yellow-400">
                      WINNER
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
