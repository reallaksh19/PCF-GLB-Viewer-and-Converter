/**
 * Types and structures for calculation envelopes.
 */

export function createResultEnvelope() {
  return {
    metadata: {
      id: '',
      name: '',
      method: '',
      unitMode: 'Native'
    },
    inputs: {},
    normalizedInputs: {},
    steps: [],
    intermediateValues: {},
    outputs: {},
    checks: [],
    warnings: [],
    errors: [],
    pass: true
  };
}
