// frontend/app/components/ProjectCard.tsx

import Link from "next/link";
import { useEffect, useState } from "react";
import axios from "axios";

// Define the type for the project prop
interface Project {
  id: number;
  budget: string;
  status: string;
  uri: string; // This is the IPFS hash
}

export const ProjectCard = ({ project }: { project: Project }) => {
  const [title, setTitle] = useState(`Project #${project.id}`);
  const [description, setDescription] = useState("Loading description...");

  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        // Decode the hex-encoded URI to get the IPFS hash
        const ipfsHash = Buffer.from(project.uri.slice(2), 'hex').toString('utf8');
        const response = await axios.get(`https://ipfs.io/ipfs/${ipfsHash}`);
        const projectData = response.data;
        setTitle(projectData.title || `Project #${project.id}`);
        setDescription(projectData.description || "No description provided.");
      } catch (error) {
        console.error("Failed to fetch project data from IPFS:", error);
        setDescription("Failed to load description from IPFS.");
      }
    };

    if (project.uri) {
      fetchProjectData();
    }
  }, [project.uri, project.id]);

  return (
    <Link href={`/project/${project.id}`} className="block border border-border rounded-lg p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start">
        <h3 className="text-xl font-bold text-text-primary">{title}</h3>
        <span className="bg-gray-200 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
          {project.status}
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold text-primary">{project.budget}</p>
      <p className="mt-2 text-text-secondary truncate">{description}</p>
    </Link>
  );
};