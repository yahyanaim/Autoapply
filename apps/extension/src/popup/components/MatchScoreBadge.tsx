import React from 'react';

interface MatchScoreBadgeProps {
  score: number;
}

export function MatchScoreBadge({ score }: MatchScoreBadgeProps) {
  const getColor = (s: number) => {
    if (s >= 80) return 'text-success';
    if (s >= 50) return 'text-yellow-500';
    return 'text-danger';
  };

  const getBgColor = (s: number) => {
    if (s >= 80) return 'bg-success-light';
    if (s >= 50) return 'bg-yellow-50';
    return 'bg-danger-light';
  };

  const getLabel = (s: number) => {
    if (s >= 80) return 'Strong match';
    if (s >= 50) return 'Moderate match';
    return 'Weak match';
  };

  const colorClass = getColor(score);
  const bgClass = getBgColor(score);
  const label = getLabel(score);

  return (
    <div
      className="flex flex-col items-center gap-2"
      role="status"
      aria-label={`Match score: ${score} out of 100. ${label}`}
    >
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center ${bgClass}`}
      >
        <span className={`text-2xl font-bold ${colorClass}`}>{score}</span>
      </div>
      <div className="text-center">
        <div className="text-xs text-gray-500">Match Score / 100</div>
        <div className={`text-xs font-medium ${colorClass}`}>{label}</div>
      </div>
    </div>
  );
}
