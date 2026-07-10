"use client";
import AdminReports from '../../../../views/admin/AdminReports';
import ProtectedRoute from '../../../../components/ProtectedRoute';

export default function ReportsPage() {
  return (
    <ProtectedRoute roles={['admin']}>
      <AdminReports />
    </ProtectedRoute>
  );
}
