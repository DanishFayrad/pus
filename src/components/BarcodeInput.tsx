import { useEffect, useRef, useState } from 'react'

interface Props {
  // Return false to keep the typed text (e.g. ambiguous match); otherwise the field clears.
  onSubmit: (barcode: string) => boolean | void
  onChange?: (value: string) => void
  autoFocus?: boolean
  placeholder?: string
}

export default function BarcodeInput({ onSubmit, onChange, autoFocus = true, placeholder }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const submit = () => {
    const v = value.trim()
    if (!v) return
    const keep = onSubmit(v) === false
    if (!keep) {
      setValue('')
      onChange?.('')
    }
    ref.current?.focus()
  }

  return (
    <div className="flex gap-2.5">
      <input
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          onChange?.(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        onBlur={() => {
          if (autoFocus) setTimeout(() => ref.current?.focus(), 50)
        }}
        placeholder={placeholder ?? 'Scan or type barcode, then Enter'}
        className="flex-1 px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-base placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm transition-all duration-200"
        inputMode="text"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={submit}
        className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98] cursor-pointer"
      >
        Add
      </button>
    </div>
  )
}
