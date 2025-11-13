// frontend/app/components/ClientApiProvider.tsx
"use client";

import { ApiProvider } from '@/app/context/ApiContext';
import { ReactNode } from 'react';

interface ClientApiProviderProps {
  children: ReactNode;
}

export const ClientApiProvider = ({ children }: ClientApiProviderProps) => {
  return (
    <ApiProvider>
      {children}
    </ApiProvider>
  );
};
