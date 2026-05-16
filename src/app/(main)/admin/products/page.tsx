"use client";
import AdminProducts from '../../../../views/admin/AdminProducts';
import ProtectedRoute from '../../../../components/ProtectedRoute';

export default function Products() {
  return (
    <ProtectedRoute roles={['admin']}>
      <AdminProducts />
    </ProtectedRoute>
  );
}
