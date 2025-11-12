// frontend/app/components/ProjectCard.tsx

import Link from "next/link";

// Define the type for the project prop
interface Project {
  id: number;
  budget: string;
  status: string;
  uri: string; // This should contain the title/description
}

export const ProjectCard = ({ project }: { project: Project }) => {
  // A simple way to get a title from the URI for display
  const title = `Project #${project.id}`;

  return (
    <Link href={`/project/${project.id}`} className="block border border-border rounded-lg p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start">
        <h3 className="text-xl font-bold text-text-primary">{title}</h3>
        <span className="bg-gray-200 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
          {project.status}
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold text-primary">{project.budget}</p>
      <p className="mt-2 text-text-secondary truncate">{project.uri}</p>
    </Link>
  );
};