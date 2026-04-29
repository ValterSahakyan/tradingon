import { useRef, type FormEvent } from 'react'
import type { ConfigSection, ConfigField } from '../types'

interface Props {
  sections: ConfigSection[]
  onSave: (values: Record<string, unknown>) => Promise<void>
  onReload: () => Promise<void>
}

export default function ConfigPanel({ sections, onSave, onReload }: Props) {
  const formRef = useRef<HTMLFormElement>(null)

  function collectValues(): Record<string, unknown> {
    const values: Record<string, unknown> = {}
    if (!formRef.current) return values
    const els = formRef.current.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-config-key]')
    els.forEach(el => {
      if ((el as HTMLInputElement).readOnly || (el as HTMLSelectElement).disabled) return
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
        <div className="mini">Saved to <span className="mono">.env</span></div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit}>
        <div className="config-sections">
          {sections.map(section => (
            <div key={section.section} className="config-section">
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

        <div className="notice">
          Config changes are written to <span className="mono">.env</span>. Most runtime settings
          require a process restart before the bot uses the new values.
        </div>

        <div className="actions" style={{ marginTop: 16 }}>
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
