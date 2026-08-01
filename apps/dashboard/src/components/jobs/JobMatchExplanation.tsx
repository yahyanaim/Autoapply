interface JobMatchExplanationProps {
  explanation: string[];
  matchedResumeSkills: string[];
  missingKeywords: string[];
}

export function JobMatchExplanation({
  explanation,
  matchedResumeSkills,
  missingKeywords,
}: JobMatchExplanationProps) {
  return (
    <details className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
      <summary className="cursor-pointer font-semibold text-gray-800">
        Why this score?
      </summary>
      <ul className="mt-2 space-y-1">
        {explanation.slice(0, 8).map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
      {matchedResumeSkills.length > 0 && (
        <p className="mt-2">
          <span className="font-semibold">Matched CV skills:</span>{' '}
          {matchedResumeSkills.join(', ')}
        </p>
      )}
      {missingKeywords.length > 0 && (
        <p className="mt-2">
          <span className="font-semibold">Missing keywords:</span>{' '}
          {missingKeywords.join(', ')}
        </p>
      )}
    </details>
  );
}
