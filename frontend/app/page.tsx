// frontend/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useApi } from "./context/ApiContext";
import { ProjectCard } from "./components/ProjectCard";
import { Codec } from '@polkadot/types/types';
import { CreateProjectModal } from "./components/CreateProjectModal";

// Define a type for your project data
interface Project {
  id: number;
  client: string;
  budget: string; // Format as string for display
  status: string;
  uri: string;
}

export default function Home() {
  const { api } = useApi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchProjects = async () => {
    if (!api) return;
    setIsLoading(true);
    // Fetch all entries from the `projects` storage map
    const projectEntries = await api.query.projects.projects.entries();
    
    const fetchedProjects = projectEntries.map(([key, value]) => {
      const id = Number(key.args[0].toString());
      const projectData = value as any; // value is a Codec
      
      // Convert codec to a plain JS object for safe property access
      const pd = projectData.isNone ? {} : projectData.unwrap().toJSON();
      
      // Normalize fields
      const client = String(pd.client ?? "");
      const budget = String(api.createType('Balance', pd.budget).toHuman() ?? "");
      const status = String(pd.status ?? "");
      const uri = (() => {
        const raw = pd.uri;
        if (typeof raw === "string") {
          try {
            if (raw.startsWith("0x")) {
              const bytes = Uint8Array.from(
                raw.slice(2).match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
              );
              return new TextDecoder().decode(bytes);
            }
            return raw;
          } catch {
            return raw;
          }
        } else if (Array.isArray(raw)) {
          return new TextDecoder().decode(new Uint8Array(raw));
        } else {
          return String(raw ?? "");
        }
      })();

      return {
        id,
        client,
        budget,
        status,
        uri,
      };
    });

    // Filter for only open projects for the marketplace view
    setProjects(fetchedProjects.filter(p => p.status === 'Created'));
    setIsLoading(false);
  };

  useEffect(() => {
    if (!api) return;

    let unsub: () => void;

    const subscribeToEvents = async () => {
        // Optional: Subscribe to new projects
        interface ChainEvent {
            section: string;
            method: string;
            [key: string]: any;
        }

        interface EventRecord {
            event: ChainEvent;
            phase?: any;
            topics?: any[];
            [key: string]: any;
        }

        unsub = await api.query.system.events((events: EventRecord[]) => {
            events.forEach((record: EventRecord) => {
                const { event } = record;
                if (event.section === 'projects' && event.method === 'ProjectCreated') {
                    console.log('ProjectCreated event detected, refetching projects...');
                    fetchProjects(); // Re-fetch projects when a new one is created
                }
            });
        }) as any;
    }

    fetchProjects();
    subscribeToEvents();

    return () => {
      // To prevent memory leaks, properly unsubscribe
      unsub && unsub();
    };

  }, [api]);

  const handleProjectCreated = () => {
    // The event listener will automatically refetch the projects.
    // We can add a user-friendly notification here if desired.
    console.log("Project creation successful! List will update shortly.");
  };

  return (
    <div>
      <div className="text-center my-12">
        <h1 className="text-5xl font-extrabold text-text-primary">
          Decentralized Work, Verifiable Results.
        </h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="mt-8 bg-primary text-white font-bold py-3 px-6 rounded-lg hover:bg-primary-hover"
        >
          + Post a New Project
        </button>
      </div>

      <CreateProjectModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onProjectCreated={handleProjectCreated}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <p>Loading projects...</p>
        ) : (
          projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))
        )}
      </div>
    </div>
  );
}