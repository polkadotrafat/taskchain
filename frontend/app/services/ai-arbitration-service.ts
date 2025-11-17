// frontend/services/ai-arbitration-service.ts
import { DisputeEvidence, AIArbitrationResponse } from '../types/arbitration';

class AIArbitrationService {
  private readonly openAIApiKey: string;
  private readonly openAIEndpoint: string = 'https://api.openai.com/v1/chat/completions';

  constructor() {
    this.openAIApiKey = process.env.OPENAI_API_KEY || '';
    
    if (!this.openAIApiKey) {
      console.warn('OpenAI API key not found. AI arbitration will not function properly.');
    }
  }

  /**
   * Evaluates a dispute using AI and returns a ruling
   */
  async evaluateDispute(evidence: DisputeEvidence): Promise<AIArbitrationResponse> {
    console.log(`Starting AI arbitration evaluation for project ${evidence.projectId}`);
    if (!this.openAIApiKey) {
      console.error('OpenAI API key not configured');
      throw new Error('OpenAI API key not configured');
    }

    // Fetch project requirements content from IPFS (stored as uri in the project)
    console.log(`Fetching project requirements for project ${evidence.projectId} from URI: ${evidence.projectRequirementsUri}`);
    let projectRequirements = '';
    if (evidence.projectRequirementsUri) {
      try {
        const content = await this.fetchContentFromURI(evidence.projectRequirementsUri);
        if (content) {
          projectRequirements = content;
          console.log(`Successfully fetched project requirements for project ${evidence.projectId}, length: ${content.length}`);
        } else {
          console.warn(`No content found for project requirements at ${evidence.projectRequirementsUri}`);
        }
      } catch (err) {
        console.warn(`Failed to fetch project requirements from ${evidence.projectRequirementsUri}`, err);
      }
    }

    // Fetch work submission content from IPFS
    console.log(`Fetching work submissions for project ${evidence.projectId}`);
    let workSubmissionsContent = '';
    if (evidence.workSubmissions && evidence.workSubmissions.length > 0) {
      for (const submission of evidence.workSubmissions) {
        try {
          console.log(`Fetching work submission from URI: ${submission.uri}`);
          const content = await this.fetchContentFromURI(submission.uri);
          if (content) {
            workSubmissionsContent += `\nWORK_SUBMISSION_${submission.contentHash || 'unknown'}: ${content}\n`;
            console.log(`Successfully fetched work submission for project ${evidence.projectId}, length: ${content.length}`);
          } else {
            console.warn(`No content found for work submission at ${submission.uri}`);
          }
        } catch (err) {
          console.warn(`Failed to fetch work submission from ${submission.uri}`, err);
        }
      }
    } else {
      console.log(`No work submissions found for project ${evidence.projectId}`);
    }

    // Create the arbitration prompt with detailed evidence
    console.log(`Building arbitration prompt for project ${evidence.projectId}...`);
    const prompt = this.buildArbitrationPrompt(evidence, projectRequirements, workSubmissionsContent);

    // Log a summary of the prompt instead of the full content
    console.log(`Arbitration prompt ready for project ${evidence.projectId}. Requirements length: ${projectRequirements.length}, Work content length: ${workSubmissionsContent.length}`);

    // Prepare the OpenAI request
    const requestBody = {
      model: 'gpt-4-turbo', // Using turbo model for better cost/performance
      messages: [
        {
          role: 'system',
          content: `You are an impartial arbitrator for a decentralized freelancing platform called TaskChain. Your role is to analyze dispute evidence objectively and make fair decisions based on facts, project requirements, and platform policies. Consider both parties equally and make decisions based solely on the evidence provided.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1, // Very low temperature for consistency in legal-style decisions
      max_tokens: 1000, // Increased token count to handle more detailed evidence
      response_format: { type: "json_object" }
    };

    try {
      console.log(`Sending request to OpenAI API for project ${evidence.projectId}...`);
      // Call OpenAI API
      const response = await fetch(this.openAIEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`OpenAI API error for project ${evidence.projectId}: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      console.log(`OpenAI API response received for project ${evidence.projectId}`);
      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        console.error(`No response choices from OpenAI for project ${evidence.projectId}`);
        throw new Error('No response from OpenAI');
      }

      // Parse the AI response
      console.log(`Parsing AI response for project ${evidence.projectId}...`);
      const aiResponse = JSON.parse(data.choices[0].message.content);
      console.log(`AI response parsed successfully for project ${evidence.projectId}: ${aiResponse.ruling}`);

      // Validate and normalize the response
      if (!this.isValidAIArbitrationResponse(aiResponse)) {
        console.error(`Invalid response format from AI for project ${evidence.projectId}:`, aiResponse);
        throw new Error('Invalid response format from AI');
      }

      // Construct the final response
      const result: AIArbitrationResponse = {
        project_id: evidence.projectId, // Add project_id from evidence
        ruling: aiResponse.ruling,
        confidence: aiResponse.confidence || 0.9, // Default high confidence if not specified
        reasoning: aiResponse.reasoning || 'AI analysis based on provided evidence',
        timestamp: new Date().toISOString(),
        evidence_hash: this.hashEvidence(evidence) // Add evidence hash for verification
      };

      console.log(`AI arbitration completed for project ${evidence.projectId}. Ruling: ${result.ruling}, Confidence: ${result.confidence}`);

      return result;
    } catch (error) {
      console.error(`AI Arbitration Service Error for project ${evidence.projectId}:`, error);
      throw error;
    }
  }

  /**
   * Fetches content from various URI schemes (IPFS, HTTP, etc.)
   */
  private async fetchContentFromURI(uri: string): Promise<string | null> {
    try {
      let contentUrl = uri;

      // Handle IPFS URIs
      if (uri.startsWith('ipfs://')) {
        const ipfsHash = uri.replace('ipfs://', '');
        contentUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
      }
      // Handle IPFS hashes directly (case where raw hash is stored without prefix)
      else if (!uri.startsWith('http://') && !uri.startsWith('https://') && !uri.startsWith('0x')) {
        // Check if it looks like an IPFS hash by length and characters
        if (uri.length > 10 && /^[a-zA-Z0-9]+$/.test(uri)) {
          contentUrl = `https://ipfs.io/ipfs/${uri}`;
        }
        // If it's a hex encoded string
        else if (uri.startsWith('0x')) {
          return this.hexToString(uri.substring(2));
        }
        // Add other potential schemes
      }
      // Handle hex-encoded strings
      else if (uri.startsWith('0x')) {
        return this.hexToString(uri.substring(2));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(contentUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch from ${contentUrl}`);
      }

      return await response.text();
    } catch (error) {
      console.error(`Error fetching content from URI ${uri}:`, error);
      return null;
    }
  }

  /**
   * Builds the prompt for the AI arbitration
   */
  private buildArbitrationPrompt(evidence: DisputeEvidence, projectRequirements: string, workSubmissionsContent: string): string {
    return `TASKCHAIN AI ARBITRATION PROMPT

CONTEXT:
You are an AI arbitrator for TaskChain, a decentralized freelancing platform that uses multi-tiered dispute resolution. Your role is to provide an initial ruling that can be appealed by human jurors. Review the evidence below and make a fair, objective decision.

DISPUTE DETAILS:
- Project ID: ${evidence.projectId}
- Claim Type: ${evidence.clientRejectionReason ? 'Work Rejected by Client' : 'Disputed Work Delivery'}

PROJECT REQUIREMENTS (FROM CLIENT):
${projectRequirements || 'No project requirements provided'}

WORK SUBMISSION (FROM FREELANCER):
${workSubmissionsContent || 'No work submission provided'}

CLIENT'S POSITION:
${evidence.clientClaim}

FREELANCER'S POSITION:
${evidence.freelancerClaim}

${evidence.clientRejectionReason ? `CLIENT'S REJECTION REASON:\n${evidence.clientRejectionReason}` : ''}

${evidence.otherEvidence ? `ADDITIONAL EVIDENCE:\n${evidence.otherEvidence}` : ''}

ARBITRATION FRAMEWORK:
- Does the work submission meet the project requirements?
- Was the work delivered according to specifications?
- Did the freelancer meet agreed deadlines?
- Were the client's rejection reasons justified?
- Did either party act in bad faith?

ANALYSIS REQUIREMENTS:
1. Compare the submitted work against the original project requirements
2. Identify specific areas where work meets or fails to meet requirements
3. Assess the validity of client's rejection reasons
4. Consider the freelancer's defense and justification

REQUIRED RESPONSE FORMAT (JSON):
{
  "ruling": "ClientWins" or "FreelancerWins",
  "confidence": float between 0.0 and 1.0 (how certain is this ruling),
  "reasoning": "Detailed explanation of decision based on comparison between project requirements and work submission",
  "factors_considered": ["list", "of", "key", "factors"],
  "requirements_satisfied_percentage": "Percentage of requirements that were satisfied by the submitted work"
}

DECISION MAKING GUIDELINES:
- Base decision strictly on provided evidence
- Consider quality, timeliness, and specification adherence
- Do not favor either party inherently
- State the reasoning clearly with specific examples from both requirements and submission
- If evidence is inconclusive, favor the party that appears to have acted in good faith`;
  }

  /**
   * Validates that the AI response has the expected format
   */
  private isValidAIArbitrationResponse(response: any): response is AIArbitrationResponse {
    // Simplified validation - only check essential fields
    // We'll add project_id separately since we have it from the evidence
    return (
      typeof response === 'object' &&
      response.ruling !== undefined &&
      ['ClientWins', 'FreelancerWins', 'Inconclusive'].includes(response.ruling) &&
      typeof response.confidence === 'number' &&
      response.confidence >= 0 &&
      response.confidence <= 1 &&
      typeof response.reasoning === 'string'
    );
  }

  /**
   * Simple hex to string conversion
   */
  private hexToString(hex: string): string {
    try {
      const bytes = new Uint8Array(
        hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );
      return new TextDecoder().decode(bytes);
    } catch {
      return hex; // Return as-is if parsing fails
    }
  }

  /**
   * Create a simple hash of the evidence for verification purposes
   */
  private hashEvidence(evidence: DisputeEvidence): string {
    // Simple stringification based hash - in production you'd want a proper hashing function
    const evidenceString = JSON.stringify({
      projectId: evidence.projectId,
      clientClaim: evidence.clientClaim,
      freelancerClaim: evidence.freelancerClaim,
      rejectionReason: evidence.clientRejectionReason
    });
    
    // Simple hash algorithm (not cryptographically secure but sufficient for this use case)
    let hash = 0;
    for (let i = 0; i < evidenceString.length; i++) {
      const char = evidenceString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// Export a singleton instance
export const aiArbitrationService = new AIArbitrationService();

// Export the class as well for potential dependency injection
export default AIArbitrationService;