import { useEffect, useState } from 'react'
import { Button, Field, Select } from './ui'
import { adjustImage, type ImageAdjustment } from '@/lib/images'
export function ImageAdjust({ file, onApply, disabled = false }: { file: File; onApply: (file: File) => void; disabled?: boolean }) {
  const [adjustment, setAdjustment] = useState<ImageAdjustment>({ rotate: 0, left: 0, top: 0, width: 100, height: 100 })
  const [preview, setPreview] = useState(''), [prepared, setPrepared] = useState<File | null>(null), [error, setError] = useState('')
  useEffect(() => {
    let active = true, url = ''
    setPrepared(null)
    const timer = setTimeout(() => void adjustImage(file, adjustment).then(result => {
      if (!active) return
      url = URL.createObjectURL(result); setPreview(url); setPrepared(result); setError('')
    }).catch(e => { if (active) { setError(e.message); setPreview('') } }), 150)
    return () => { active = false; clearTimeout(timer); if (url) URL.revokeObjectURL(url) }
  }, [file, adjustment])
  return <section className="my-3 space-y-2 rounded border border-rule p-3" aria-label="Crop and rotate image">
    <Select label="Rotate image" value={adjustment.rotate} disabled={disabled} onChange={e => setAdjustment(a => ({ ...a, rotate: Number(e.target.value) }))}>{[0, 90, 180, 270].map(n => <option key={n} value={n}>{n}°</option>)}</Select>
    <div className="grid grid-cols-2 gap-2">{(['left', 'top', 'width', 'height'] as const).map(key => <Field key={key} label={`Crop ${key} percent`} type="number" min={key === 'width' || key === 'height' ? 1 : 0} max={100} value={adjustment[key]} disabled={disabled} onChange={e => setAdjustment(a => ({ ...a, [key]: Math.min(100, Math.max(0, Number(e.target.value))) }))} />)}</div>
    {preview && <img src={preview} alt="Adjusted image preview" className="max-h-64 max-w-full rounded object-contain" />}
    {error && <p role="alert" className="text-sm text-crit">{error}</p>}
    <Button disabled={disabled || !prepared} onClick={() => { if (prepared) onApply(prepared) }}>Use adjusted image</Button>
  </section>
}
