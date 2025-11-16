// frontend/app/components/ProjectApplicants.tsx
"use client";

import { useEffect, useState } from 'react';
import { useApi } from '@/app/context/ApiContext';
import { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import { Button } from './ui/Button';

interface ProjectApplicantsProps {
  projectId: number;
  client: string;
  onApplicantAssigned: () => void;
}

export const ProjectApplicants = ({ projectId, client, onApplicantAssigned }: ProjectApplicantsProps) => {
  const { api, selectedAccount, signer } = useApi();
  const [applicants, setApplicants] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api) return;

    const fetchApplicants = async () => {
      setIsLoading(true);
      try {
        const applicantsCodec = await api.query.projects.projectApplicants(projectId);
        const applicantsList = (applicantsCodec as any).map((applicant: any) => applicant.toString());
        setApplicants(applicantsList);
      } catch (err) {
        console.error("Error fetching applicants:", err);
        setError("Failed to fetch applicants.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchApplicants();
  }, [api, projectId]);

  const handleAssignFreelancer = async (freelancerAddress: string) => {
    if (!api || !signer || !selectedAccount || selectedAccount.address !== client) {
      setError("You are not authorized to assign a freelancer.");
      return;
    }

    setIsAssigning(freelancerAddress);
    setError('');

    try {
      const tx = api.tx.projects.startWork(projectId, freelancerAddress);
      await new Promise<void>((resolve, reject) => {
        tx.signAndSend(selectedAccount.address, { signer }, ({ status }) => {
          if (status.isFinalized) {
            console.log(`Transaction finalized: ${status.asFinalized}`);
            setIsAssigning(null);
            onApplicantAssigned();
            resolve();
          }
        }).catch((error: any) => {
          console.error("Transaction failed:", error);
          setError(error.message || "Transaction failed");
          setIsAssigning(null);
          reject(error);
        });
      });
    } catch (err: any) {
      console.error("Assign freelancer error:", err);
      setError(err.message || "An unknown error occurred.");
      setIsAssigning(null);
    }
  };

  if (isLoading) {
    return <p>Loading applicants...</p>;
  }

  if (error) {
    return <p className="text-red-500">{error}</p>;
  }

  if (applicants.length === 0) {
    return <p>No applicants yet.</p>;
  }

  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold mb-2">Applicants</h3>
      <ul className="space-y-2">
        {applicants.map((applicant) => (
          <li key={applicant} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
            <span className="font-mono text-sm">{applicant}</span>
            {selectedAccount?.address === client && (
              <Button
                onClick={() => handleAssignFreelancer(applicant)}
                isLoading={isAssigning === applicant}
                disabled={isAssigning !== null}
              >
                {isAssigning === applicant ? 'Assigning...' : 'Assign'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
