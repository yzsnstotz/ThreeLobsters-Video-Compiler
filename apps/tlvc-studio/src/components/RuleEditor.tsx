import type { ExtractorRule } from '../types';

interface RuleEditorProps {
  rules: ExtractorRule[];
  onChange: (rules: ExtractorRule[]) => void;
  fieldName: string;
  showPreserveNewlines?: boolean;
  hitCounts?: Array<{ ruleIndex: number; hitCount: number }>;
  examples?: Array<{ ruleIndex: number; samples: string[] }>;
}

export function RuleEditor({
  rules,
  onChange,
  fieldName,
  showPreserveNewlines = false,
  hitCounts = [],
  examples = [],
}: RuleEditorProps) {
  const updateRule = (index: number, patch: Partial<ExtractorRule>) => {
    const next = rules.slice();
    next[index] = { ...next[index], ...patch } as ExtractorRule;
    onChange(next);
  };

  const addRule = () => {
    onChange([
      ...rules,
      {
        selector: '',
        value: { type: 'text' },
        normalize: { trim: true },
      },
    ]);
  };

  const removeRule = (index: number) => {
    if (rules.length <= 1) return;
    onChange(rules.filter((_, i) => i !== index));
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = rules.slice();
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number) => {
    if (index >= rules.length - 1) return;
    const next = rules.slice();
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const hitMap = new Map(hitCounts.map((h) => [h.ruleIndex, h.hitCount]));
  const examplesMap = new Map(examples.map((e) => [e.ruleIndex, e.samples]));

  return (
    <div className="rule-list">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <strong>{fieldName} rules</strong>
        <button type="button" className="btn" onClick={addRule}>Add rule</button>
      </div>
      {rules.map((rule, index) => (
        <div key={index} className="rule-card">
          <div className="rule-row">
            <label style={{ minWidth: 80 }}>Selector</label>
            <input
              type="text"
              value={rule.selector}
              onChange={(e) => updateRule(index, { selector: e.target.value })}
              placeholder={'e.g. div[class*="sender"]'}
              style={{ flex: '1 1 200px' }}
            />
          </div>
          <div className="rule-row">
            <label style={{ minWidth: 80 }}>Value type</label>
            <select
              value={rule.value.type}
              onChange={(e) =>
                updateRule(index, {
                  value: {
                    ...rule.value,
                    type: e.target.value as 'text' | 'attr',
                    name: e.target.value === 'attr' ? rule.value.name ?? '' : undefined,
                  },
                })
              }
            >
              <option value="text">text</option>
              <option value="attr">attr</option>
            </select>
            {rule.value.type === 'attr' && (
              <input
                type="text"
                value={rule.value.name ?? ''}
                onChange={(e) => updateRule(index, { value: { ...rule.value, name: e.target.value } })}
                placeholder="attr name"
                style={{ width: 120 }}
              />
            )}
            {showPreserveNewlines && rule.value.type === 'text' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={!!rule.value.preserveNewlines}
                  onChange={(e) => updateRule(index, { value: { ...rule.value, preserveNewlines: e.target.checked } })}
                />
                preserve newlines
              </label>
            )}
          </div>
          <div className="rule-row">
            <label style={{ minWidth: 80 }}>Normalize</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={!!rule.normalize?.trim}
                onChange={(e) =>
                  updateRule(index, {
                    normalize: { ...rule.normalize, trim: e.target.checked ? true : undefined },
                  })
                }
              />
              trim
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={!!rule.normalize?.collapseWhitespace}
                onChange={(e) =>
                  updateRule(index, {
                    normalize: { ...rule.normalize, collapseWhitespace: e.target.checked ? true : undefined },
                  })
                }
              />
              collapse whitespace
            </label>
          </div>
          {(hitMap.get(index) != null || (examplesMap.get(index)?.length ?? 0) > 0) && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Hits: {hitMap.get(index) ?? 0}
              {examplesMap.get(index)?.length ? (
                <span> · Samples: {examplesMap.get(index)!.slice(0, 2).join('; ')}</span>
              ) : null}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn" onClick={() => moveUp(index)} disabled={index === 0}>↑</button>
            <button type="button" className="btn" onClick={() => moveDown(index)} disabled={index === rules.length - 1}>↓</button>
            <button type="button" className="btn" onClick={() => removeRule(index)} disabled={rules.length <= 1}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}
