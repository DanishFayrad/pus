"use client";
import RestaurantSalesView from '../../../../views/admin/RestaurantSalesView';
import ProtectedRoute from '../../../../components/ProtectedRoute';

export default function RestaurantSalesPage() {
  return (
    <ProtectedRoute roles={['admin', 'cashier']}>
      <RestaurantSalesView />
    </ProtectedRoute>
  );
}
