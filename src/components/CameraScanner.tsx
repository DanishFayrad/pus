'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onDetected: (barcode: string) => void
}

const READER_ID = 'sp-camera-scanner-reader'
const CAMERA_PREF_KEY = 'salespoint.camera-id'

interface CamDevice {
  id: string
  label: string
}

export default function CameraScanner({ open, onClose, onDetected }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [devices, setDevices] = useState<CamDevice[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const scannerRef = useRef<unknown | null>(null)
  const stoppedRef = useRef(false)

  // Discover cameras when modal opens
  useEffect(() => {
    if (!open) return
    let cancelled = false

    import('html5-qrcode')
      .then(async ({ Html5Qrcode }) => {
        try {
          const list = await Html5Qrcode.getCameras()
          if (cancelled) return
          const cams: CamDevice[] = list.map((d) => ({
            id: d.id,
            label: d.label || `Camera (${d.id.slice(0, 6)}…)`,
          }))
          setDevices(cams)
          const remembered = typeof window !== 'undefined'
            ? localStorage.getItem(CAMERA_PREF_KEY)
            : null
          const initial =
            (remembered && cams.find((c) => c.id === remembered)?.id) ||
            // Prefer rear/back/environment camera if name hints
            cams.find((c) => /back|rear|environment/i.test(c.label))?.id ||
            cams[0]?.id ||
            null
          setSelectedId(initial)
        } catch (e) {
          if (!cancelled) {
            setError(
              e instanceof Error
                ? e.message
                : 'Could not list cameras. Permission may be denied.',
            )
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load scanner')
      })

    return () => {
      cancelled = true
    }
  }, [open])

  // Start the chosen camera
  useEffect(() => {
    if (!open || !selectedId) return

    let cancelled = false
    stoppedRef.current = false
    setError(null)
    setStarting(true)

    import('html5-qrcode')
      .then(async ({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
        if (cancelled) return

        // Stop any previous instance before re-starting on a different cam
        const prev = scannerRef.current as
          | { stop: () => Promise<void>; clear: () => void; getState: () => number }
          | null
        if (prev) {
          try {
            if (prev.getState && prev.getState() === 2) await prev.stop()
            prev.clear()
          } catch {
            /* ignore */
          }
          scannerRef.current = null
        }

        const scanner = new Html5Qrcode(READER_ID, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        })
        scannerRef.current = scanner

        try {
          await scanner.start(
            { deviceId: { exact: selectedId } },
            { fps: 10, qrbox: { width: 280, height: 160 } },
            (decoded) => {
              if (stoppedRef.current) return
              stoppedRef.current = true
              if (typeof window !== 'undefined') {
                localStorage.setItem(CAMERA_PREF_KEY, selectedId)
              }
              onDetected(decoded)
            },
            undefined,
          )
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : 'Could not start the selected camera.',
          )
        } finally {
          if (!cancelled) setStarting(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load scanner')
          setStarting(false)
        }
      })

    return () => {
      cancelled = true
      stoppedRef.current = true
      const s = scannerRef.current as
        | { stop: () => Promise<void>; clear: () => void; getState: () => number }
        | null
      if (s) {
        try {
          if (s.getState && s.getState() === 2) {
            s.stop().then(() => s.clear()).catch(() => s.clear())
          } else {
            s.clear()
          }
        } catch {
          /* swallow */
        }
        scannerRef.current = null
      }
    }
  }, [open, selectedId, onDetected])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 flex items-center justify-between border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Scan barcode</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 text-xl leading-none w-8 h-8 rounded-md hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {devices.length > 1 && (
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Camera ({devices.length} available)
            </label>
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="relative bg-slate-900 aspect-[4/3]">
          <div id={READER_ID} className="w-full h-full" />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
              Starting camera…
            </div>
          )}
        </div>

        {error ? (
          <div className="px-5 py-4 text-sm text-red-700 bg-red-50 border-t border-red-200">
            <div className="font-medium mb-1">Camera unavailable</div>
            <div className="text-xs leading-relaxed">{error}</div>
            <div className="text-xs leading-relaxed mt-2 text-slate-600">
              Camera access requires HTTPS (or localhost) and permission. On the
              deployed Vercel URL it works automatically.
            </div>
          </div>
        ) : (
          <div className="px-5 py-3 text-xs text-slate-500 border-t border-slate-200">
            {devices.length > 1
              ? 'Multiple cameras detected — pick the right one above. Your choice is remembered.'
              : 'Point the camera at a product barcode. It will be added to the cart automatically when detected.'}
          </div>
        )}
      </div>
    </div>
  )
}
