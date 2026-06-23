"use client";
import AdminCredits from '../../../../views/admin/AdminCredits';
import ProtectedRoute from '../../../../components/ProtectedRoute';

export default function Credits() {
  return (
    <ProtectedRoute roles={['admin', 'cashier']}>
      <AdminCredits />
    </ProtectedRoute>
  );
}
