'use client'
import RestaurantPos from '../../../../views/admin/RestaurantPos'
import ProtectedRoute from '../../../../components/ProtectedRoute'

export default function RestaurantPage() {
  return (
    <ProtectedRoute roles={['admin', 'cashier', 'waiter']}>
      <RestaurantPos />
    </ProtectedRoute>
  )
}
