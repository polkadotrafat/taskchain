// frontend/app/project/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/app/context/ApiContext";
import { useParams } from "next/navigation";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";

import { InitiateDisputeModal } from "@/app/components/InitiateDisputeModal";

// Define a type for the project data, extending it for more details
interface ProjectDetailsType {
  id: number;
  client: string;
  freelancer: string | null;
  budget: string;
  status: string;
  title: string;
  description: string;
}

// --- Main Page Component ---
export default function ProjectPage() {
  const { api, selectedAccount, signer } = useApi();
  const params = useParams();
  const id = Number(params.id);

  const [project, setProject] = useState<ProjectDetailsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // --- Data Fetching ---
  useEffect(() => {
    if (!api || isNaN(id)) return;

    let unsub: () => void;

    const fetchProjectDetails = async () => {
      setIsLoading(true);
      unsub = await api.query.projects.projects(id, (projectDataCodec: any) => {
        if (projectDataCodec.isNone) {
          setError("Project not found.");
          setIsLoading(false);
          return;
        }

        const pd = projectDataCodec.unwrap().toJSON() as any;

        // Parse URI
        let title = `Project #${id}`;
        let description = "No description provided.";
        try {
          if (pd.uri) {
            const uriContent = Buffer.from(pd.uri.slice(2), 'hex').toString('utf-8');
            const uriData = JSON.parse(uriContent);
            title = uriData.title || title;
            description = uriData.description || description;
          }
        } catch (e) {
          console.error("Failed to parse project URI:", e);
          if (typeof pd.uri === 'string') {
              description = pd.uri;
          }
        }

        setProject({
          id,
          client: String(pd.client),
          freelancer: pd.freelancer ? String(pd.freelancer) : null,
          budget: String(api.createType('Balance', pd.budget).toHuman()),
          status: Object.keys(pd.status)[0], // The status is an enum, get the key
          title,
          description,
        });

        setIsLoading(false);
      }) as any;
    };

    fetchProjectDetails();

    return () => {
      unsub && unsub();
    }
  }, [api, id]);

  if (isLoading) return <div className="text-center p-10">Loading project details...</div>;
  if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
  if (!project) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <ProjectDetails project={project} />
      {selectedAccount && signer && (
        <ProjectActions project={project} currentUser={selectedAccount} />
      )}
    </div>
  );
}


// --- ProjectDetails Component ---
const ProjectDetails = ({ project }: { project: ProjectDetailsType }) => {
  return (
    <div className="bg-white shadow-md rounded-lg p-8 mb-6">
      <div className="flex justify-between items-start mb-4">
        <h1 className="text-3xl font-bold text-gray-800">{project.title}</h1>
        <span className={`text-sm font-semibold px-3 py-1 rounded-full ${project.status === 'InDispute' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
          {project.status}
        </span>
      </div>
      <p className="text-gray-600 mb-6">{project.description}</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="font-semibold text-gray-500">BUDGET</h4>
          <p className="text-lg font-mono text-gray-900">{project.budget}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="font-semibold text-gray-500">CLIENT</h4>
          <p className="text-lg font-mono text-gray-900 truncate">{project.client}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="font-semibold text-gray-500">FREELANCER</h4>
          <p className="text-lg font-mono text-gray-900 truncate">
            {project.freelancer || "Not Assigned"}
          </p>
        </div>
      </div>
    </div>
  );
};


// --- ProjectActions Component ---
const ProjectActions = ({ project, currentUser }: { project: ProjectDetailsType, currentUser: InjectedAccountWithMeta }) => {
    const { api, signer } = useApi();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);

    const handleGenericAction = async (pallet: 'projects' | 'arbitration', extrinsic: string, args: any[]) => {
        if (!api || !signer) return;
        setIsSubmitting(true);

        const tx = api.tx[pallet][extrinsic](...args);

        return new Promise<void>((resolve, reject) => {
            tx.signAndSend(currentUser.address, { signer }, ({ status }) => {
                if (status.isInBlock) {
                    console.log(`Transaction included in block: ${status.asInBlock}`);
                }
                if (status.isFinalized) {
                    console.log(`Transaction finalized: ${status.asFinalized}`);
                    setIsSubmitting(false);
                    // The modal will close itself, and the page subscription will update the UI
                    resolve();
                }
            }).catch((error: any) => {
                console.error("Transaction failed:", error);
                setIsSubmitting(false);
                reject(error);
            });
        });
    };
    
    const handleInitiateDispute = async () => {
        await handleGenericAction('arbitration', 'initiateAiDispute', [project.id]);
        setIsDisputeModalOpen(false); // Close modal on success
    };

    const isClient = project.client === currentUser.address;
    const isFreelancer = project.freelancer === currentUser.address;
    const isPotentialFreelancer = !isClient && !project.freelancer;

    return (
        <>
            <InitiateDisputeModal 
                isOpen={isDisputeModalOpen}
                onClose={() => setIsDisputeModalOpen(false)}
                onConfirm={handleInitiateDispute}
                projectName={project.title}
            />
            <div className="bg-white shadow-md rounded-lg p-8">
                <h2 className="text-xl font-bold mb-4">Actions</h2>
                <div className="flex space-x-4">
                    {project.status === 'Created' && isPotentialFreelancer && (
                        <button onClick={() => handleGenericAction('projects', 'assignFreelancer', [project.id])} disabled={isSubmitting} className="action-button">
                            {isSubmitting ? 'Accepting...' : 'Accept Job'}
                        </button>
                    )}
                    {project.status === 'InProgress' && isFreelancer && (
                        <button onClick={() => handleGenericAction('projects', 'submitWork', [project.id])} disabled={isSubmitting} className="action-button">
                            {isSubmitting ? 'Submitting...' : 'Submit Work'}
                        </button>
                    )}
                    {project.status === 'InReview' && isClient && (
                        <>
                            <button onClick={() => handleGenericAction('projects', 'acceptWork', [project.id])} disabled={isSubmitting} className="action-button bg-green-500 hover:bg-green-600">
                                {isSubmitting ? 'Accepting...' : 'Accept Work'}
                            </button>
                            <button onClick={() => handleGenericAction('projects', 'rejectWork', [project.id])} disabled={isSubmitting} className="action-button bg-red-500 hover:bg-red-600">
                                {isSubmitting ? 'Rejecting...' : 'Reject Work'}
                            </button>
                        </>
                    )}
                    {project.status === 'Rejected' && isFreelancer && (
                         <button onClick={() => setIsDisputeModalOpen(true)} disabled={isSubmitting} className="action-button bg-yellow-500 hover:bg-yellow-600">
                            {isSubmitting ? '...' : 'Initiate Dispute'}
                        </button>
                    )}
                </div>
                {project.status === 'InDispute' && (
                    <p className="text-gray-500">This project is currently in dispute. No further actions can be taken until the dispute is resolved.</p>
                )}
            </div>
        </>
    );
};
