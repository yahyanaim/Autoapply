import React, { useState } from 'react';

interface MatchScoreOverlayProps {
  score: number;
  jobId: string;
  confidence: number;
  explanation: string[];
  missingKeywords: string[];
  onClose: () => void;
  onPrepare: () => Promise<{ applicationId: string; reviewUrl: string }>;
  onFillApproved: () => Promise<number>;
}

export function MatchScoreOverlay({
  score,
  jobId,
  confidence,
  explanation,
  missingKeywords,
  onClose,
  onPrepare,
  onFillApproved,
}: MatchScoreOverlayProps) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [isFilling, setIsFilling] = useState(false);
  const [reviewUrl, setReviewUrl] = useState('');
  const [isFilled, setIsFilled] = useState(false);
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

  const handlePrepare = async () => {
    setIsPreparing(true);
    setError('');
    try {
      const result = await onPrepare();
      setReviewUrl(result.reviewUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Preparation failed');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleFillApproved = async () => {
    setIsFilling(true);
    setError('');
    try {
      const filled = await onFillApproved();
      setIsFilled(filled > 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Package fill failed');
    } finally {
      setIsFilling(false);
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
        {confidence > 0 && (
          <div className="mt-1 text-[10px] text-gray-500">
            Evidence confidence: {confidence}%
          </div>
        )}
      </div>

      {explanation.length > 0 && (
        <details className="mb-3 rounded-xl bg-gray-50 p-3 text-[11px] leading-4 text-gray-600">
          <summary className="cursor-pointer font-semibold text-gray-800">
            Why this score?
          </summary>
          <ul className="mt-2 space-y-1">
            {explanation.slice(0, 5).map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
          {missingKeywords.length > 0 && (
            <p className="mt-2">
              <span className="font-semibold text-gray-700">Missing:</span>{' '}
              {missingKeywords.slice(0, 8).join(', ')}
            </p>
          )}
        </details>
      )}

      <button
        onClick={handlePrepare}
        disabled={isPreparing || Boolean(reviewUrl)}
        className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
          reviewUrl
            ? 'bg-success text-white cursor-default'
            : 'bg-primary text-white hover:bg-primary-hover active:scale-[0.98]'
        } ${isPreparing ? 'opacity-70 cursor-wait' : ''}`}
        aria-label="Prepare optimized CV and cover letter"
      >
        {reviewUrl
          ? '✓ Package ready for review'
          : isPreparing
            ? 'Preparing CV + letter…'
            : 'Prepare application'}
      </button>
      {reviewUrl && (
        <a
          href={reviewUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex w-full items-center justify-center rounded-xl border border-primary px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/5"
        >
          Review and approve in ApplyAI
        </a>
      )}
      <button
        onClick={handleFillApproved}
        disabled={isFilling || isFilled}
        className={`mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 ${
          isFilling ? 'cursor-wait opacity-70' : ''
        }`}
        aria-label="Fill the form with an approved application package"
      >
        {isFilled
          ? '✓ Approved package filled'
          : isFilling
            ? 'Loading approved package…'
            : 'Fill approved package'}
      </button>
      <p className="mt-2 text-[10px] leading-4 text-gray-500">
        ApplyAI never clicks the final Submit button. Review every field yourself.
      </p>
      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
