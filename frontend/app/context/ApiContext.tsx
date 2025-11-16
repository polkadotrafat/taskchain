// frontend/app/context/ApiContext.tsx
"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { web3Accounts, web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import { Signer } from '@polkadot/types/types';
import { WS_PROVIDER } from '@/app/constants';

interface ApiContextType {
  api: ApiPromise | null;
  accounts: InjectedAccountWithMeta[];
  selectedAccount: InjectedAccountWithMeta | null;
  signer: Signer | null;
  isConnecting: boolean;
  isApiReady: boolean;
  connect: () => Promise<void>;
  setSelectedAccount: (account: InjectedAccountWithMeta) => void;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

export const ApiProvider = ({ children }: { children: ReactNode }) => {
  const [api, setApi] = useState<ApiPromise | null>(null);
  const [accounts, setAccounts] = useState<InjectedAccountWithMeta[]>([]);
  const [selectedAccount, setSelectedAccountState] = useState<InjectedAccountWithMeta | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isApiReady, setIsApiReady] = useState(false);

  // Effect to initialize the API connection
  useEffect(() => {
    let isCancelled = false;
    setIsApiReady(false);

    const setup = async () => {
      try {
        const provider = new WsProvider(WS_PROVIDER);
        const apiPromise = new ApiPromise({
          provider,
          types: {
            "EnumDeprecationInfo": {
              "_enum": {
                "WithOrigin": "Vec<u8>",
                "WithoutOrigin": "Null"
              }
            }
          }
        });

        await apiPromise.isReady;
        if (!isCancelled) {
          console.log('API is ready');
          setApi(apiPromise);
          setIsApiReady(true);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to connect to API:', error);
        }
      }
    };

    setup();

    return () => {
      isCancelled = true;
      api?.disconnect();
    };
  }, []);

  // Function to connect to the wallet extensions
  const connect = async () => {
    setIsConnecting(true);
    try {
      const extensions = await web3Enable('TaskChain Demo');
      if (extensions.length === 0) {
        alert('No wallet extension found. Please install Polkadot.js, Talisman, or SubWallet.');
        setIsConnecting(false);
        return;
      }

      const allAccounts = await web3Accounts();
      setAccounts(allAccounts);

      if (allAccounts.length > 0) {
        await setSelectedAccountWithSigner(allAccounts[0]);
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const setSelectedAccountWithSigner = async (account: InjectedAccountWithMeta) => {
    try {
      setSelectedAccountState(account);
      const injector = await web3FromSource(account.meta.source);
      setSigner(injector.signer);
    } catch (error) {
      console.error('Error setting signer:', error);
    }
  };

  const setSelectedAccount = (account: InjectedAccountWithMeta) => {
    setSelectedAccountWithSigner(account);
  };

  return (
    <ApiContext.Provider value={{ 
      api, 
      accounts, 
      selectedAccount, 
      signer, 
      isConnecting,
      isApiReady,
      connect, 
      setSelectedAccount 
    }}>
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
