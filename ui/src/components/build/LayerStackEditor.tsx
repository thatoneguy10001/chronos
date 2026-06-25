import { GENRE_PRESETS, KNOWN_LAYERS, useBuildStore } from '@/store/buildStore';
import { layerSpec } from '@/build/layers';

/**
 * Layer Stack editor — the genre picker.
 *
 * Choosing which engine layers are active *is* choosing the genre. The builder
 * starts from a preset or toggles layers individually; dependencies are pulled in
 * automatically (turn on Combat and you get Space + Entities), so the stack the
 * engine receives is always valid. The bottom shows the exact `layers[]` this
 * produces in the world manifest.
 */
export function LayerStackEditor({ onBack }: { onBack: () => void }) {
  const layers = useBuildStore(s => s.draft.layers);
  const toggleLayer = useBuildStore(s => s.toggleLayer);
  const applyPreset = useBuildStore(s => s.applyPreset);
  const clearLayers = useBuildStore(s => s.clearLayers);
  const validate = useBuildStore(s => s.validate);
  const errors = validate();

  const labelStyle = { color: 'var(--ink-faint)', fontSize: '0.7em', letterSpacing: '0.15em', fontFamily: 'var(--font-dossier)' as const };

  return (
    <div style={{ width: 'min(640px, 100%)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Presets */}
      <div>
        <div style={{ ...labelStyle, marginBottom: '0.6rem' }}>START FROM A GENRE</div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {GENRE_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              title={p.blurb}
              style={{
                flex: '1 1 180px',
                textAlign: 'left',
                background: 'transparent',
                border: '1px solid var(--ink-faint)',
                color: 'var(--ink-narrative)',
                fontFamily: 'var(--font-dossier)',
                padding: '0.6rem 0.75rem',
                cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.85em' }}>{p.label}</div>
              <div style={{ color: 'var(--ink-movement)', fontSize: '0.72em', marginTop: '0.2rem', lineHeight: 1.4 }}>{p.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Individual layers */}
      <div>
        <div style={{ ...labelStyle, marginBottom: '0.6rem' }}>OR CHOOSE LAYERS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {KNOWN_LAYERS.map(layer => {
            const active = layers.includes(layer.id);
            const reqLabels = layer.requires.map(r => layerSpec(r)?.label ?? r);
            return (
              <label
                key={layer.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  border: '1px solid var(--ink-faint)',
                  borderRadius: 2,
                  padding: '0.6rem 0.75rem',
                  cursor: 'pointer',
                  background: active ? 'rgba(120, 90, 40, 0.08)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleLayer(layer.id)}
                  style={{ marginTop: '0.2rem', accentColor: 'var(--ink-narrative)' }}
                />
                <div>
                  <div style={{ color: 'var(--ink-narrative)', fontWeight: 600, fontSize: '0.9em' }}>{layer.label}</div>
                  <div style={{ color: 'var(--ink-movement)', fontSize: '0.75em', fontFamily: 'var(--font-dossier)', marginTop: '0.15rem', lineHeight: 1.4 }}>
                    {layer.description}
                    {reqLabels.length > 0 && (
                      <span style={{ color: 'var(--ink-faint)' }}> · needs {reqLabels.join(', ')}</span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Resulting stack */}
      <div>
        <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>YOUR LAYER STACK</div>
        {layers.length === 0 ? (
          <div style={{ color: 'var(--ink-movement)', fontSize: '0.85em', fontStyle: 'italic' }}>
            No layers yet — pick a genre or toggle layers above.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
              {layers.map((id, i) => (
                <span key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span
                    style={{
                      border: '1px solid var(--ink-narrative)',
                      borderRadius: 2,
                      padding: '0.2rem 0.55rem',
                      color: 'var(--ink-narrative)',
                      fontSize: '0.78em',
                      fontFamily: 'var(--font-dossier)',
                    }}
                  >
                    {layerSpec(id)?.label ?? id}
                  </span>
                  {i < layers.length - 1 && <span style={{ color: 'var(--ink-faint)' }}>→</span>}
                </span>
              ))}
            </div>
            <div style={{ marginTop: '0.6rem', color: errors.length ? 'var(--error)' : 'var(--ink-movement)', fontSize: '0.78em', fontFamily: 'var(--font-dossier)' }}>
              {errors.length === 0 ? '✓ Valid stack — the engine will accept this.' : errors.join('  ')}
            </div>
            <button
              onClick={clearLayers}
              style={{ marginTop: '0.6rem', background: 'transparent', border: 'none', color: 'var(--ink-faint)', fontFamily: 'var(--font-dossier)', fontSize: '0.72em', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              clear
            </button>
          </>
        )}
      </div>

      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          border: '1px solid var(--ink-faint)',
          color: 'var(--ink-narrative)',
          fontFamily: 'var(--font-dossier)',
          fontSize: '0.8em',
          padding: '0.5rem 1.5rem',
          cursor: 'pointer',
          letterSpacing: '0.12em',
        }}
      >
        ← BUILD SECTIONS
      </button>
    </div>
  );
}
