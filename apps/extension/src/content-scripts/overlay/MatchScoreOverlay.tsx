import React, { useState } from 'react';

interface MatchScoreOverlayProps {
  score: number;
  jobId: string;
  onClose: () => void;
  onAutofill: () => Promise<number>;
}

export function MatchScoreOverlay({
  score,
  jobId,
  onClose,
  onAutofill,
}: MatchScoreOverlayProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isAutofilled, setIsAutofilled] = useState(false);
  const [error, setError] = useState('');

  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-success';
    if (s >= 50) return 'text-yellow-500';
    return 'text-danger';
  };

  const getScoreBg = (s: number) => {
    if (s >= 80) return 'bg-success-light';
    if (s >= 50) return 'bg-yellow-50';
    return 'bg-danger-light';
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return 'Strong match';
    if (s >= 50) return 'Moderate match';
    return 'Weak match';
  };

  const handleAutofill = async () => {
    setIsLoading(true);
    setError('');
    try {
      const filled = await onAutofill();
      setIsAutofilled(filled > 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Autofill failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="w-[300px] bg-white rounded-3xl shadow-overlay border border-gray-200 p-5 font-sans animate-slide-in"
      data-job-id={jobId}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <img
            src={chrome.runtime.getURL('icons/icon48.png')}
            alt=""
            className="h-7 w-7 object-contain"
          />
          <span className="text-sm font-semibold text-gray-900">ApplyAI</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close overlay"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col items-center mb-4">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center ${getScoreBg(score)}`}
          role="status"
          aria-label={`Match score: ${score} out of 100. ${getScoreLabel(score)}`}
        >
          <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</span>
        </div>
        <div className="text-[10px] text-gray-500 mt-2">Match Score / 100</div>
        <div className={`text-xs font-medium ${getScoreColor(score)}`}>
          {getScoreLabel(score)}
        </div>
      </div>

      <button
        onClick={handleAutofill}
        disabled={isLoading || isAutofilled}
        className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
          isAutofilled
            ? 'bg-success text-white cursor-default'
            : 'bg-primary text-white hover:bg-primary-hover active:scale-[0.98]'
        } ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
        aria-label={isAutofilled ? 'Form fields filled' : 'Autofill form fields (review before submit)'}
      >
        {isAutofilled ? '✓ Filled — review & submit' : isLoading ? 'Filling...' : 'Autofill (review before submit)'}
      </button>
      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
