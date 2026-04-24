const SECTION_HEADERS = ['Jurisdiction', 'Case Facts', 'Opening Statement', 'Trial Strategy'];

export function parseCaseDocument(text) {
  const lines = text.split('\n');
  const result = { caseName: '', jurisdiction: '', facts: '', opening: '', strategy: '' };
  const keyMap = {
    'Jurisdiction': 'jurisdiction',
    'Case Facts': 'facts',
    'Opening Statement': 'opening',
    'Trial Strategy': 'strategy',
  };

  let currentSection = null;
  const sectionContent = {};

  for (const line of lines) {
    if (line.trimStart().startsWith('Case:')) {
      result.caseName = line.replace(/^.*?Case:\s*/i, '').trim();
      currentSection = null;
      continue;
    }

    const trimmed = line.trim();
    if (SECTION_HEADERS.includes(trimmed)) {
      currentSection = keyMap[trimmed];
      continue;
    }

    if (currentSection) {
      sectionContent[currentSection] = (sectionContent[currentSection] || '') + line + '\n';
    }
  }

  return {
    caseName: result.caseName,
    jurisdiction: (sectionContent.jurisdiction || '').trim(),
    facts: (sectionContent.facts || '').trim(),
    opening: (sectionContent.opening || '').trim(),
    strategy: (sectionContent.strategy || '').trim(),
  };
}

export function validateCaseDoc(doc) {
  const missing = [];
  if (!doc.caseName) missing.push('Case name');
  if (!doc.facts) missing.push('Case Facts');
  if (!doc.opening) missing.push('Opening Statement');
  if (!doc.strategy) missing.push('Trial Strategy');
  return missing;
}
