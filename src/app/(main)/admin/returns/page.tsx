"use client";
import AdminReturns from '../../../../views/admin/AdminReturns';
import ProtectedRoute from '../../../../components/ProtectedRoute';

export default function Returns() {
  return (
    <ProtectedRoute roles={['admin']}>
      <AdminReturns />
    </ProtectedRoute>
  );
}
