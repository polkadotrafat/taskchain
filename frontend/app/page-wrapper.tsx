// frontend/app/page-wrapper.tsx
"use client";

import dynamic from 'next/dynamic';

// Dynamically import the Home component with SSR disabled
const HomePage = dynamic(() => import('./page-content'), { 
  ssr: false,
  loading: () => <div className="text-center p-12">Loading TaskChain...</div>
});

export default function PageWrapper() {
  return <HomePage />;
}