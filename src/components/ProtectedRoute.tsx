import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'

interface Props {
  children: ReactNode
  roles?: Role[]
}

export default function ProtectedRoute({ children, roles }: Props) {
  const { user, loading } = useAuth() as any // handle loading if it exists, assume false if not
  const pathname = usePathname()
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    if (user === undefined) return; // wait for auth init
    if (!user) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`)
      return
    }
    if (roles && !roles.includes(user.role)) {
      router.replace(user.role === 'admin' ? '/admin' : '/pos')
      return
    }
    setIsAuthorized(true)
  }, [user, roles, pathname, router])

  if (!isAuthorized) return null

  return <>{children}</>
}
