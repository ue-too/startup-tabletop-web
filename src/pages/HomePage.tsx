import { useNavigate } from 'react-router';
import { Swords, Eye, Film } from 'lucide-react';

const modes = [
  {
    title: 'Play vs AI',
    description: 'Challenge the trained neural network in a head-to-head startup battle. Can you out-strategize the machine?',
    icon: Swords,
    path: '/play',
    color: 'from-cyan-500 to-blue-600',
    hoverBorder: 'hover:border-cyan-500/60',
    iconColor: 'text-cyan-400',
    glow: 'group-hover:shadow-cyan-500/20',
  },
  {
    title: 'Simulate',
    description: 'Watch AI agents compete against each other. Adjust player count, speed, and observe emergent strategies.',
    icon: Eye,
    path: '/simulate',
    color: 'from-amber-500 to-orange-600',
    hoverBorder: 'hover:border-amber-500/60',
    iconColor: 'text-amber-400',
    glow: 'group-hover:shadow-amber-500/20',
  },
  {
    title: 'Replay',
    description: 'Load a saved game replay and scrub through every decision frame by frame with full controls.',
    icon: Film,
    path: '/replay',
    color: 'from-purple-500 to-pink-600',
    hoverBorder: 'hover:border-purple-500/60',
    iconColor: 'text-purple-400',
    glow: 'group-hover:shadow-purple-500/20',
  },
] as const;

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      {/* Title */}
      <div className="mb-4 text-center">
        <h1 className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl">
          STARTUP SIMULATOR
        </h1>
        <p className="mt-3 text-sm tracking-widest text-gray-500 uppercase">
          Build. Compete. Dominate.
        </p>
      </div>

      {/* Divider */}
      <div className="mb-12 h-px w-48 bg-gradient-to-r from-transparent via-gray-600 to-transparent" />

      {/* Mode Cards */}
      <div className="grid w-full max-w-4xl gap-6 sm:grid-cols-3">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              key={mode.path}
              onClick={() => navigate(mode.path)}
              className={`group relative flex cursor-pointer flex-col items-center rounded-2xl border border-gray-800 bg-gray-900/80 p-8 text-center backdrop-blur-sm transition-all duration-300 ${mode.hoverBorder} hover:-translate-y-1 hover:shadow-2xl ${mode.glow}`}
            >
              {/* Gradient glow behind icon */}
              <div className={`absolute top-6 h-16 w-16 rounded-full bg-gradient-to-br ${mode.color} opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-30`} />

              <div className={`relative mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-gray-700/50 bg-gray-800/80 ${mode.iconColor} transition-colors`}>
                <Icon size={28} strokeWidth={1.5} />
              </div>

              <h2 className="mb-2 text-lg font-bold text-white">
                {mode.title}
              </h2>

              <p className="text-sm leading-relaxed text-gray-400">
                {mode.description}
              </p>

              {/* Bottom accent line */}
              <div className={`absolute bottom-0 left-1/2 h-0.5 w-0 -translate-x-1/2 rounded-full bg-gradient-to-r ${mode.color} transition-all duration-300 group-hover:w-2/3`} />
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <p className="mt-16 text-xs text-gray-600">
        Powered by ONNX Runtime &middot; React 19 &middot; Vite
      </p>
    </div>
  );
}
