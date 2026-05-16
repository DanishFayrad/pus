"use client";
import AdminSales from '../../../../views/admin/AdminSales';
import ProtectedRoute from '../../../../components/ProtectedRoute';

export default function Sales() {
  return (
    <ProtectedRoute roles={['admin']}>
      <AdminSales />
    </ProtectedRoute>
  );
}
