import { useEffect, useRef, useState } from 'react'

interface Props {
  onSubmit: (barcode: string) => void
  autoFocus?: boolean
  placeholder?: string
}

export default function BarcodeInput({ onSubmit, autoFocus = true, placeholder }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const submit = () => {
    const v = value.trim()
    if (!v) return
    onSubmit(v)
    setValue('')
    ref.current?.focus()
  }

  return (
    <div className="flex gap-2">
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
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
        className="flex-1 px-4 py-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        inputMode="text"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={submit}
        className="px-4 py-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium"
      >
        Add
      </button>
    </div>
  )
}
