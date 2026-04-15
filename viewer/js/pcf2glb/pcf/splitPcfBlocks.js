export function splitPcfBlocks(text, log) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trimEnd())
    .filter(l => l.trim() !== '');

  const blockStarts = new Set([
    'PIPE', 'BEND', 'ELBOW', 'TEE', 'OLET', 'VALVE', 'FLANGE', 'REDUCER', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC', 'SUPPORT', 'MESSAGE-SQUARE', 'MESSAGE-CIRCLE'
  ]);

  const blocks = [];
  let current = null;

  for (const line of lines) {
    const token = line.trim().split(/\s+/)[0];
    if (blockStarts.has(token)) {
      if (current) blocks.push(current);
      current = { type: token, lines: [line], rawAttrs: {} };
    } else if (current) {
      current.lines.push(line);
      const match = line.match(/^\s*([A-Z0-9\-]+)\s+(.*)$/);
      if (match) {
          current.rawAttrs[match[1]] = match[2];
      }
    } else {
      if (log) log.warn('ORPHAN_LINE', { line });
    }
  }

  if (current) blocks.push(current);
  return blocks;
}
