// frontend/app/components/WalletConnectButton.tsx
"use client";

import { useApi } from '@/app/context/ApiContext';

export const WalletConnectButton = () => {
  const { connect, accounts, selectedAccount, setSelectedAccount } = useApi();

  if (selectedAccount) {
    // Display the selected account and a dropdown to change it
    const shortenedAddress = `${selectedAccount.address.substring(0, 6)}...${selectedAccount.address.substring(selectedAccount.address.length - 4)}`;
    
    return (
        <div>
            <span>Connected: {shortenedAddress}</span>
            {accounts.length > 1 && (
                <select 
                    value={selectedAccount.address} 
                    onChange={(e) => {
                        const newSelected = accounts.find(acc => acc.address === e.target.value);
                        if(newSelected) setSelectedAccount(newSelected);
                    }}
                >
                    {accounts.map(account => (
                        <option key={account.address} value={account.address}>
                            {account.meta.name} ({`${account.address.substring(0, 6)}...`})
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
  }

  // Display the connect button
  return (
    <button
      onClick={connect}
      style={{ background: '#E6007A', color: 'white', padding: '10px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
    >
      Connect Wallet
    </button>
  );
};