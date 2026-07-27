import React from 'react';
import ReactDOM from 'react-dom/client';
import { MatchScoreOverlay } from './MatchScoreOverlay';
import overlayStyles from '../../styles/globals.css?inline';

export function injectOverlay(
  container: HTMLElement,
  score: number,
  jobId: string,
  onPrepare: () => Promise<{ applicationId: string; reviewUrl: string }>,
  onFillApproved: () => Promise<number>,
): void {
  const existingRoot = container.querySelector('#applyai-root');
  if (existingRoot) {
    existingRoot.remove();
  }

  const shadow = container.attachShadow({ mode: 'open' });

  const root = document.createElement('div');
  root.id = 'applyai-root';
  shadow.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `${overlayStyles}
    :host {
      all: initial;
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: Inter, system-ui, sans-serif;
    }

    @keyframes slide-in {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .animate-slide-in {
      animation: slide-in 0.3s ease;
    }
  `;
  shadow.appendChild(style);

  const reactRoot = ReactDOM.createRoot(root);
  reactRoot.render(
    React.createElement(MatchScoreOverlay, {
      score,
      jobId,
      onClose: () => {
        reactRoot.unmount();
        container.remove();
      },
      onPrepare,
      onFillApproved,
    }),
  );
}
