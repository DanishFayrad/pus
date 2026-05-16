"use client";
import '../index.css';
import { AuthProvider } from '../context/AuthContext';
import { StoreProvider } from '../context/StoreContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <StoreProvider>
            {children}
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
