"use client";
import '../index.css';
import { AuthProvider } from '../context/AuthContext';
import { StoreProvider } from '../context/StoreContext';
import { ConfirmProvider } from '../components/ConfirmProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Milano Garden - POS System</title>
      </head>
      <body>
        <AuthProvider>
          <StoreProvider>
            <ConfirmProvider>
              {children}
            </ConfirmProvider>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
