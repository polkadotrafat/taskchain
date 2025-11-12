// frontend/app/components/ReputationCard.tsx
"use client";

// --- Types ---
interface ReputationData {
    projects_completed: number;
    projects_accepted: number;
    total_earned: string;
    total_spent: string;
    positive_feedback: number;
    negative_feedback: number;
    disputes_won: number;
    disputes_lost: number;
    juror_tier: string;
    jury_votes_cast: number;
    jury_votes_correct: number;
}

export const ReputationCard = ({ reputation }: { reputation: ReputationData }) => {
    const stats = [
        { label: "Projects Completed", value: reputation.projects_completed },
        { label: "Projects Accepted", value: reputation.projects_accepted },
        { label: "Total Earned", value: reputation.total_earned },
        { label: "Total Spent", value: reputation.total_spent },
        { label: "Disputes Won", value: reputation.disputes_won },
        { label: "Disputes Lost", value: reputation.disputes_lost },
        { label: "Jury Votes Cast", value: reputation.jury_votes_cast },
        { label: "Jury Votes Correct", value: reputation.jury_votes_correct },
    ];

    return (
        <div className="bg-white shadow-md rounded-lg p-8">
            <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-gray-800">On-Chain Reputation</h2>
                <span className="bg-purple-100 text-purple-800 text-sm font-semibold px-3 py-1 rounded-full">
                    {reputation.juror_tier} Juror
                </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map(stat => (
                    <div key={stat.label} className="bg-gray-50 p-3 rounded-md">
                        <h4 className="font-semibold text-gray-500 text-xs">{stat.label}</h4>
                        <p className="text-lg font-semibold text-gray-900">{stat.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};
