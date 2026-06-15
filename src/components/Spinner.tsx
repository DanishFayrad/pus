interface Props {
  className?: string
}

export default function Spinner({ className = 'w-3.5 h-3.5' }: Props) {
  return (
    <svg
      className={`${className} animate-spin inline-block align-[-0.125em]`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
