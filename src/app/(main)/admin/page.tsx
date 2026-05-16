"use client";
import AdminDashboard from '../../../views/admin/AdminDashboard';
import ProtectedRoute from '../../../components/ProtectedRoute';

export default function Admin() {
  return (
    <ProtectedRoute roles={['admin']}>
      <AdminDashboard />
    </ProtectedRoute>
  );
}
