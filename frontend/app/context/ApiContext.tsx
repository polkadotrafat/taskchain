// frontend/app/context/ApiContext.tsx

"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { web3Accounts, web3Enable, web3FromSource } from '@polkadot/extension-dapp';
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
    const setup = async () => {
      const provider = new WsProvider(WS_PROVIDER);
      const apiPromise = new ApiPromise({ provider });
      
      apiPromise.on('connected', () => console.log('API connected'));
      apiPromise.on('error', (err) => console.error('API error', err));

      await apiPromise.isReady;
      console.log('API is ready');
      setApi(apiPromise);
    };

    setup();

    return () => {
      api?.disconnect();
    };
  }, [api]);

  // Function to connect to the wallet extensions
  const connect = async () => {
    try {
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