// Grok cost fallback: grok's CLI JSON envelope carried no usage block when probed
// (2026-07-08, grok 0.2.91), so cost is estimated from transcript characters at the
// published launch rates. Rows built this way are stamped cost_basis
// "estimated-transcript"; rows with real usage use cost_basis "reported".
export const GROK_RATES_PER_MTOK = { input: 2, output: 6 };

export function tokensFromChars(chars) {
  return Math.ceil((chars || 0) / 4);
}

export function grokCostUsd({ inputTokens, outputTokens }) {
  const input = (inputTokens / 1_000_000) * GROK_RATES_PER_MTOK.input;
  const output = (outputTokens / 1_000_000) * GROK_RATES_PER_MTOK.output;
  return Number((input + output).toFixed(4));
}

// Pre-registered estimate shape: everything the model read (prompt + transcript
// body) counts as input, everything it emitted (final text + thinking) as output.
export function estimateGrokUsage({ promptChars, transcriptChars, outputChars }) {
  const inputTokens = tokensFromChars(promptChars + Math.max(0, (transcriptChars || 0) - (outputChars || 0)));
  const outputTokens = tokensFromChars(outputChars);
  return { input_tokens: inputTokens, output_tokens: outputTokens };
}
