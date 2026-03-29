interface TalentCardProps {
  name: string;
  compact?: boolean;
}

export function TalentCard({ name, compact = false }: TalentCardProps) {
  if (compact) {
    return (
      <span className="inline-block rounded bg-gray-600 px-1.5 py-0.5 text-[10px] font-medium text-gray-200">
        {name}
      </span>
    );
  }

  return (
    <span className="inline-block rounded border border-gray-600 bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-100">
      {name}
    </span>
  );
}
