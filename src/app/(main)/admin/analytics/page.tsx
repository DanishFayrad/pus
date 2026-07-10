"use client";
import AdminAnalytics from '../../../../views/admin/AdminAnalytics';
import ProtectedRoute from '../../../../components/ProtectedRoute';

export default function AnalyticsPage() {
  return (
    <ProtectedRoute roles={['admin']}>
      <AdminAnalytics />
    </ProtectedRoute>
  );
}
