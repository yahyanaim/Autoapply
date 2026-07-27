import React, { useState, useEffect } from 'react';
import { ActionButton } from './components/ActionButton';
import { MatchScoreBadge } from './components/MatchScoreBadge';

export function PopupApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }, (response: { authenticated?: boolean }) => {
      setIsAuthenticated(Boolean(response?.authenticated));
    });
  }, []);

  const handleAnalyzeJob = async () => {
    setIsLoading(true);
    setError('');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      setError('No active tab is available');
      setIsLoading(false);
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_ANALYSIS' }, (response: { error?: string }) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError || response?.error) {
        setError(response?.error || 'Open a supported job posting first');
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
      window.close();
    });
  };

  const handleShowMatchScore = async () => {
    setIsLoading(true);
    setError('');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      setError('No active tab is available');
      setIsLoading(false);
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: 'GET_MATCH_SCORE' },
      (response: { result?: { matchScore: number }; error?: string }) => {
        const runtimeError = chrome.runtime.lastError;
        if (response?.result) {
          setMatchScore(response.result.matchScore);
        } else {
          setError(response?.error || runtimeError?.message || 'Open a supported job posting first');
        }
        setIsLoading(false);
      }
    );
  };

  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="w-80 bg-white font-sans">
      <div className="flex items-center gap-3 p-4 bg-dark-900 border-b border-gray-200">
        <img src="/icons/icon48.png" alt="" className="h-8 w-8 object-contain" />
        <span className="text-white text-base font-bold">ApplyAI</span>
      </div>

      <div className="p-4">
        {!isAuthenticated ? (
          <div className="mb-4">
            <p className="text-gray-500 text-xs mb-3">
              Sign in to get personalized match scores and autofill.
            </p>
            <ActionButton
              variant="primary"
              onClick={handleOpenOptions}
              ariaLabel="Sign in to your account"
            >
              Sign In
            </ActionButton>
          </div>
        ) : (
          <div className="text-xs text-success font-medium mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-success rounded-full"></span>
            Connected
          </div>
        )}

        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Quick Actions
        </div>

        <div className="space-y-2">
          <ActionButton
            variant="primary"
            onClick={handleAnalyzeJob}
            disabled={isLoading}
            ariaLabel="Analyze current job posting"
          >
            {isLoading ? 'Analyzing...' : 'Analyze Job'}
          </ActionButton>

          <ActionButton
            variant="secondary"
            onClick={handleShowMatchScore}
            disabled={isLoading}
            ariaLabel="Show match score for current job"
          >
            Show Match Score
          </ActionButton>
        </div>

        {matchScore !== null && (
          <div className="mt-4 p-3 bg-gray-100 rounded-xl">
            <MatchScoreBadge score={matchScore} />
          </div>
        )}
        {error && (
          <p className="mt-3 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 bg-gray-100 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-success rounded-full"></span>
          <span className="text-xs text-gray-500">Ready</span>
        </div>
        <button
          onClick={handleOpenOptions}
          className="text-xs text-primary font-medium hover:underline"
          aria-label="Open settings"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
