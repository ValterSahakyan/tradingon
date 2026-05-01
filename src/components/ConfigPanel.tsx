import { useRef, useState, useEffect, type FormEvent } from 'react'
import type { ConfigSection, ConfigField } from '../types'

interface Props {
  sections: ConfigSection[]
  onSave: (values: Record<string, unknown>) => Promise<void>
  onReload: () => Promise<void>
}

export default function ConfigPanel({ sections, onSave, onReload }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const [activeTab, setActiveTab] = useState<string | null>(null)

  useEffect(() => {
    if (sections.length > 0 && !activeTab) {
      setActiveTab(sections[0].section)
    }
  }, [sections, activeTab])

  function collectValues(): Record<string, unknown> {
    const values: Record<string, unknown> = {}
    if (!formRef.current) return values
    // Query all inputs, even those hidden via CSS
    const els = formRef.current.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-config-key]')
    els.forEach(el => {
      if ('readOnly' in el && el.readOnly) return
      if ('disabled' in el && el.disabled) return
      values[el.dataset.configKey!] = el.value
    })
    return values
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await onSave(collectValues())
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Configuration</div>
        <div className="mini">Saved to <span className="mono">database</span></div>
      </div>

      {sections.length > 0 && (
        <div className="config-tabs">
          {sections.map(s => (
            <button
              key={s.section}
              type="button"
              className={`config-tab-btn ${activeTab === s.section ? 'active' : ''}`}
              onClick={() => setActiveTab(s.section)}
            >
              {s.section}
            </button>
          ))}
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit}>
        <div className="config-sections">
          {sections.map(section => (
            <div
              key={section.section}
              className="config-section"
              style={{ display: activeTab === section.section ? 'block' : 'none' }}
            >
              <div className="panel-head" style={{ marginBottom: 0 }}>
                <div className="panel-title">{section.section}</div>
              </div>
              <div className="config-grid">
                {section.fields.map(field => (
                  <ConfigFieldWidget key={field.key} field={field} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="actions" style={{ marginTop: 24 }}>
          <button type="submit" className="btn-primary">Save Config</button>
          <button type="button" className="btn-secondary" onClick={onReload}>Reload View</button>
        </div>
      </form>
    </div>
  )
}

function ConfigFieldWidget({ field }: { field: ConfigField }) {
  const help = field.help ?? ''

  if (field.type === 'boolean') {
    const isTrue = String(field.rawValue) === 'true' || field.rawValue === true
    return (
      <label className="config-field">
        <strong>{field.label}</strong>
        <select data-config-key={field.key} defaultValue={isTrue ? 'true' : 'false'} disabled={!field.editable}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        <small>{help}</small>
      </label>
    )
  }

  if (field.type === 'json') {
    const displayValue =
      typeof field.rawValue === 'string'
        ? field.rawValue
        : JSON.stringify(field.rawValue ?? null)

    return (
      <label className="config-field">
        <strong>{field.label}</strong>
        <textarea
          data-config-key={field.key}
          defaultValue={displayValue}
          placeholder={field.value ? String(field.value) : undefined}
          readOnly={!field.editable}
          rows={3}
        />
        <small>{help || 'Enter valid JSON'}</small>
      </label>
    )
  }

  const isPassword = field.key.toLowerCase().includes('key') || field.key.toLowerCase().includes('secret')
  const inputType = isPassword ? 'password' : field.type === 'number' ? 'number' : 'text'
  const displayValue = field.editable ? (field.rawValue ?? '') : (field.value ?? '')

  return (
    <label className="config-field">
      <strong>{field.label}</strong>
      <input
        type={inputType}
        step={field.type === 'number' ? 'any' : undefined}
        data-config-key={field.key}
        defaultValue={String(displayValue)}
        placeholder={field.value ? String(field.value) : undefined}
        readOnly={!field.editable}
      />
      <small>{help}</small>
    </label>
  )
}
