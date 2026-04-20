/**
 * Dropdown for choosing an AI opponent's agent type. Emits a SeatConfig.
 * Session-scoped only — does not persist across reloads (spec: agent-selection
 * §"Opponent picker in setup UI").
 */

import { personaNames } from "../ai/personas";
import type { SeatConfig } from "../game/seat";

export interface OpponentPickerProps {
  seatIndex: number;
  value: SeatConfig;
  modelPath: string;
  onChange: (seat: SeatConfig) => void;
  label?: string;
  className?: string;
}

type OptionValue = `onnx` | `utilityBt:${string}`;

function encodeValue(seat: SeatConfig): OptionValue | "" {
  if (seat.kind === "onnx") return "onnx";
  if (seat.kind === "utilityBt") return `utilityBt:${seat.persona}`;
  return "";
}

function decodeValue(raw: string, modelPath: string): SeatConfig {
  if (raw === "onnx") return { kind: "onnx", modelPath };
  const m = raw.match(/^utilityBt:(.+)$/);
  if (m) return { kind: "utilityBt", persona: m[1] };
  return { kind: "onnx", modelPath };
}

export function OpponentPicker({
  seatIndex,
  value,
  modelPath,
  onChange,
  label,
  className = "",
}: OpponentPickerProps) {
  const current = encodeValue(value);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label
        htmlFor={`opponent-${seatIndex}`}
        className="text-xs font-medium text-gray-400"
      >
        {label ?? `Opponent ${seatIndex + 1}`}
      </label>
      <select
        id={`opponent-${seatIndex}`}
        value={current}
        onChange={(e) => onChange(decodeValue(e.target.value, modelPath))}
        className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-500"
      >
        <option value="onnx">ONNX (neural)</option>
        {personaNames.map((name) => (
          <option key={name} value={`utilityBt:${name}`}>
            UtilityBT · {name}
          </option>
        ))}
      </select>
    </div>
  );
}
