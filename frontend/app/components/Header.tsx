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
        <div className="flex items-center space-x-6">
          <Link 
            href="/" 
            className="text-text-secondary hover:text-primary transition-colors duration-200"
          >
            Marketplace
          </Link>
          <Link 
            href="/create-project" 
            className="text-text-secondary hover:text-primary transition-colors duration-200"
          >
            Create Project
          </Link>
          {selectedAccount && (
            <>
              <Link
                href="/dashboard"
                className="text-text-secondary hover:text-primary transition-colors duration-200"
              >
                Dashboard
              </Link>
              <Link
                href="/jury"
                className="text-text-secondary hover:text-primary transition-colors duration-200"
              >
                Jury Duty
              </Link>
            </>
          )}
          <WalletConnectButton />
        </div>
      </nav>
    </header>
  );
};