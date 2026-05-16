"use client";
import PosPage from '../../../views/PosPage';
import ProtectedRoute from '../../../components/ProtectedRoute';

export default function Pos() {
  return (
    <ProtectedRoute roles={['admin', 'cashier']}>
      <PosPage />
    </ProtectedRoute>
  );
}
