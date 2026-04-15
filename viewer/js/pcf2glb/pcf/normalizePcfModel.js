function toNum(value, field, log, ctx) {
  if (value === undefined || value === null) return null;
  // Parse coordinates which might be 'x y z bore'
  if (field === 'ENDPOINT' || field === 'CO-ORDS') {
      const parts = String(value).trim().split(/\s+/).map(Number);
      if (parts.length >= 3 && parts.every(Number.isFinite)) {
          return { x: parts[0], y: parts[1], z: parts[2], bore: parts[3] || 0 };
      }
      if (log) log.warn('BAD_COORD', { field, value, ctx });
      return null;
  }

  const n = Number(value);
  if (!Number.isFinite(n)) {
    if (log) log.warn('BAD_NUMBER', { field, value, ctx });
    return null;
  }
  return n;
}

function normalizeBlock(block, log, idx) {
    const comp = {
        id: `comp_${idx}`,
        type: block.type,
        raw: block.rawAttrs
    };

    // Extract endpoints
    const endPoints = [];
    for (const line of block.lines) {
        if (line.includes('END-POINT')) {
             const pt = toNum(line.replace('END-POINT', '').trim(), 'ENDPOINT', log, block.type);
             if (pt) endPoints.push(pt);
        } else if (line.includes('CO-ORDS')) {
             const pt = toNum(line.replace('CO-ORDS', '').trim(), 'CO-ORDS', log, block.type);
             if (pt) endPoints.push(pt);
        }
    }

    if (endPoints.length > 0) comp.ep1 = endPoints[0];
    if (endPoints.length > 1) comp.ep2 = endPoints[1];

    if (comp.ep1) comp.bore = comp.ep1.bore;

    // MESSAGE-CIRCLE: extract CO-ORDS and TEXT for node label display
    if (block.type === 'MESSAGE-CIRCLE') {
        for (const line of block.lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('CO-ORDS')) {
                const pt = toNum(trimmed.replace('CO-ORDS', '').trim(), 'CO-ORDS', log, 'MESSAGE-CIRCLE');
                if (pt) comp.circleCoord = { x: pt.x, y: pt.y, z: pt.z };
            } else if (trimmed.startsWith('TEXT')) {
                comp.circleText = trimmed.replace(/^TEXT\s+/i, '').trim();
            }
        }
    }

    // MESSAGE-SQUARE: extract annotation text (first non-empty line in block)
    // Position is resolved post-parse from the following component's ep1.
    if (block.type === 'MESSAGE-SQUARE') {
        const textLine = block.lines.find(l => l.trim());
        if (textLine) comp.squareText = textLine.trim();
    }

    return comp;
}

export function normalizePcfModel(parsed, log) {
  const components = [];

  parsed.blocks.forEach((block, idx) => {
    const comp = normalizeBlock(block, log, idx);
    if (comp) components.push(comp);
  });

  // Post-process: assign squarePos from the following component's endpoint
  for (let i = 0; i < components.length; i++) {
    if (components[i].type === 'MESSAGE-SQUARE' && components[i].squareText) {
      for (let j = i + 1; j < components.length; j++) {
        const next = components[j];
        if (next.type !== 'MESSAGE-SQUARE' && next.type !== 'MESSAGE-CIRCLE') {
          const pt = next.ep1 || (next.ep2);
          if (pt) {
            components[i].squarePos = { x: pt.x, y: pt.y, z: pt.z };
          }
          break;
        }
      }
    }
  }

  return {
    meta: parsed.meta,
    components,
  };
}
