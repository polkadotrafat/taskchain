// frontend/app/components/Header.tsx
"use client";

import Link from "next/link";
import { WalletConnectButton } from "./WalletConnectButton";
import { useApi } from "../context/ApiContext";

export const Header = () => {
  const { selectedAccount } = useApi();

  return (
    <header className="border-b border-border">
      <nav className="container mx-auto flex justify-between items-center p-4">
        <Link href="/" className="text-2xl font-bold text-primary">
          TaskChain
        </Link>
        <div className="flex items-center space-x-4">
          {selectedAccount && (
            <Link href="/dashboard" className="text-text-secondary hover:text-primary">
              Dashboard
            </Link>
          )}
          <WalletConnectButton />
        </div>
      </nav>
    </header>
  );
};