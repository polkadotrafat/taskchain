// frontend/app/context/ApiContext.tsx

"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import { Signer } from '@polkadot/types/types';
import { WS_PROVIDER } from '@/app/constants';

// The WebSocket endpoint of your local node

interface ApiContextType {
  api: ApiPromise | null;
  accounts: InjectedAccountWithMeta[];
  selectedAccount: InjectedAccountWithMeta | null;
  signer: Signer | null;
  connect: () => Promise<void>;
  setSelectedAccount: (account: InjectedAccountWithMeta) => void;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

export const ApiProvider = ({ children }: { children: ReactNode }) => {
  const [api, setApi] = useState<ApiPromise | null>(null);
  const [accounts, setAccounts] = useState<InjectedAccountWithMeta[]>([]);
  const [selectedAccount, setSelectedAccountState] = useState<InjectedAccountWithMeta | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);

  // Effect to initialize the API connection
  useEffect(() => {
    let isCancelled = false; // To handle component unmounting

    const setup = async () => {
      try {
        const provider = new WsProvider(WS_PROVIDER);
        
        // Create API with specific options to handle newer extensions
        const apiPromise = new ApiPromise({ 
          provider,
          // Configure to handle newer chain features gracefully
          signedExtensions: undefined, // Use default behavior for handling signed extensions
          rpc: {}, // Default RPC configuration
        });

        apiPromise.on('connected', () => {
          if (!isCancelled) {
            console.log('API connected');
          }
        });
        apiPromise.on('disconnected', () => {
          if (!isCancelled) {
            console.log('API disconnected');
          }
        });
        apiPromise.on('error', (err) => {
          if (!isCancelled) {
            console.error('API error', err);
          }
        });

        // Wait for the API to be ready
        await apiPromise.isReady;
        if (!isCancelled) {
          console.log('API is ready');
          setApi(apiPromise);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to connect to API:', error);
        }
      }
    };

    setup();

    // Cleanup function
    return () => {
      isCancelled = true;
      api?.disconnect();
    };
  }, []); // Removed [api] dependency to prevent re-initialization

  // Function to connect to the wallet extensions
  const connect = async () => {
    try {
      const { web3Enable, web3Accounts } = await import('@polkadot/extension-dapp');
      const extensions = await web3Enable('TaskChain Demo');
      if (extensions.length === 0) {
        alert('No wallet extension found. Please install Polkadot.js, Talisman, or SubWallet.');
        return;
      }
      const allAccounts = await web3Accounts();
      setAccounts(allAccounts);
      if (allAccounts.length > 0) {
        setSelectedAccount(allAccounts[0]); // Select the first account by default
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
    }
  };

  const setSelectedAccount = async (account: InjectedAccountWithMeta) => {
    setSelectedAccountState(account);
    if (api) {
        const { web3FromSource } = await import('@polkadot/extension-dapp');
        const injector = await web3FromSource(account.meta.source);
        setSigner(injector.signer);
    }
  };


  return (
    <ApiContext.Provider value={{ api, accounts, selectedAccount, signer, connect, setSelectedAccount }}>
      {children}
    </ApiContext.Provider>
  );
};

export const useApi = () => {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
};