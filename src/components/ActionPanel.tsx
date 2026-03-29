import type { Action } from '../engine/actions/base';
import { ActionType } from '../engine/types';

interface ActionPanelProps {
  actions: Action[];
  onAction: (index: number) => void;
}

const ACTION_GROUPS: Record<string, ActionType[]> = {
  'Recruit': [ActionType.RECRUIT],
  'Assign': [ActionType.ASSIGN, ActionType.ASSIGN_ONE, ActionType.END_ASSIGN_BATCH, ActionType.RECALL, ActionType.REASSIGN],
  'Product': [ActionType.IDEATION, ActionType.GREENLIGHT, ActionType.LAUNCH, ActionType.PIVOT, ActionType.INTEGRATE],
  'Strategy': [ActionType.BRAINSTORM, ActionType.PLAY_STRATEGY],
  'Finance': [ActionType.INVEST, ActionType.DIVEST, ActionType.BUYBACK, ActionType.SECONDARY_TRADE, ActionType.ACQUISITION],
  'Staff': [ActionType.LAYOFF_SOURCE, ActionType.FIRE_STAFF, ActionType.DISCARD_TALENT],
  'Decisions': [
    ActionType.CHOOSE_MODE, ActionType.CHOOSE_XP, ActionType.CHOOSE_OFFLINE,
    ActionType.BID_AUDIT, ActionType.PASS_AUDIT, ActionType.FOLD, ActionType.SETTLE,
    ActionType.CONSENT_YES, ActionType.CONSENT_NO, ActionType.COUNTER_OFFER, ActionType.DECLINE_COUNTER,
    ActionType.DISCARD_BACKLOG, ActionType.DISCARD_STRATEGY,
    ActionType.VOLUNTARY_DISCLOSURE,
  ],
  'Control': [ActionType.PASS],
};

function getActionLabel(action: Action): string {
  const typeName = ActionType[action.actionType] ?? `Action${action.actionType}`;
  const parts = [typeName.replace(/_/g, ' ')];

  if (action.sourceType) {
    parts.push(`(${action.sourceType.replace(/_/g, ' ')})`);
  }

  if (action.sourceIndex >= 0 && action.actionType !== ActionType.ASSIGN_ONE) {
    parts.push(`#${action.sourceIndex}`);
  }

  if (action.targetInstance >= 0) {
    parts.push(`-> inst ${action.targetInstance}`);
  }

  if (action.amount >= 0 && [ActionType.BID_AUDIT, ActionType.INVEST, ActionType.BUYBACK].includes(action.actionType)) {
    parts.push(`$${action.amount}`);
  }

  return parts.join(' ');
}

function getGroupForAction(actionType: ActionType): string {
  for (const [group, types] of Object.entries(ACTION_GROUPS)) {
    if (types.includes(actionType)) return group;
  }
  return 'Other';
}

const GROUP_COLORS: Record<string, string> = {
  'Recruit': 'bg-blue-700 hover:bg-blue-600',
  'Assign': 'bg-teal-700 hover:bg-teal-600',
  'Product': 'bg-green-700 hover:bg-green-600',
  'Strategy': 'bg-purple-700 hover:bg-purple-600',
  'Finance': 'bg-amber-700 hover:bg-amber-600',
  'Staff': 'bg-red-700 hover:bg-red-600',
  'Decisions': 'bg-indigo-700 hover:bg-indigo-600',
  'Control': 'bg-gray-600 hover:bg-gray-500',
  'Other': 'bg-gray-600 hover:bg-gray-500',
};

export function ActionPanel({ actions, onAction }: ActionPanelProps) {
  // Group actions
  const grouped = new Map<string, { action: Action; index: number }[]>();
  actions.forEach((action, index) => {
    const group = getGroupForAction(action.actionType);
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push({ action, index });
  });

  return (
    <div className="rounded-lg border border-indigo-700 bg-gray-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
          Your Actions
        </h3>
        <span className="text-[10px] text-gray-500">{actions.length} available</span>
      </div>

      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([group, items]) => (
          <div key={group}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {group}
            </div>
            <div className="flex flex-wrap gap-1">
              {items.map(({ action, index }) => (
                <button
                  key={index}
                  onClick={() => onAction(index)}
                  className={`rounded px-2 py-1 text-[11px] font-medium text-white transition-colors ${
                    GROUP_COLORS[group] ?? GROUP_COLORS['Other']
                  }`}
                  title={`Action ${index}: ${ActionType[action.actionType]}`}
                >
                  {getActionLabel(action)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {actions.length === 0 && (
        <p className="text-center text-xs italic text-gray-500">No actions available</p>
      )}
    </div>
  );
}
