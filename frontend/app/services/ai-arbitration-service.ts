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
    if (!this.openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Fetch work submission content from IPFS if present
    let workContent = '';
    if (evidence.workSubmissions && evidence.workSubmissions.length > 0) {
      for (const submission of evidence.workSubmissions) {
        try {
          const content = await this.fetchContentFromURI(submission.uri);
          if (content) {
            workContent += `\nWORK_SUBMISSION_${submission.contentHash || 'unknown'}: ${content}\n`;
          }
        } catch (err) {
          console.warn(`Failed to fetch work submission from ${submission.uri}`, err);
        }
      }
    }

    // Create the arbitration prompt
    const prompt = this.buildArbitrationPrompt(evidence, workContent);

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
      max_tokens: 800,
      response_format: { type: "json_object" }
    };

    try {
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
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from OpenAI');
      }

      // Parse the AI response
      const aiResponse = JSON.parse(data.choices[0].message.content);
      
      // Validate and normalize the response
      if (!this.isValidAIArbitrationResponse(aiResponse)) {
        throw new Error('Invalid response format from AI');
      }

      // Construct the final response
      const result: AIArbitrationResponse = {
        project_id: evidence.projectId,
        ruling: aiResponse.ruling,
        confidence: aiResponse.confidence || 0.9, // Default high confidence if not specified
        reasoning: aiResponse.reasoning || 'AI analysis based on provided evidence',
        timestamp: new Date().toISOString(),
        evidence_hash: this.hashEvidence(evidence) // Add evidence hash for verification
      };

      return result;
    } catch (error) {
      console.error('AI Arbitration Service Error:', error);
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
      // Handle other schemes if needed
      else if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
        // If it's a direct content (hex encoded), decode it
        if (uri.startsWith('0x')) {
          return this.hexToString(uri.substring(2));
        }
        // Add other potential schemes
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
  private buildArbitrationPrompt(evidence: DisputeEvidence, workContent: string): string {
    return `TASKCHAIN AI ARBITRATION PROMPT

CONTEXT:
You are an AI arbitrator for TaskChain, a decentralized freelancing platform that uses multi-tiered dispute resolution. Your role is to provide an initial ruling that can be appealed by human jurors. Review the evidence below and make a fair, objective decision.

DISPUTE DETAILS:
- Project ID: ${evidence.projectId}
- Claim Type: ${evidence.clientRejectionReason ? 'Work Rejected by Client' : 'Disputed Work Delivery'}

EVIDENCE PROVIDED:

CLIENT'S POSITION:
${evidence.clientClaim}

FREELANCER'S POSITION:  
${evidence.freelancerClaim}

${workContent ? `WORK DELIVERABLE:\n${workContent}` : ''}

${evidence.clientRejectionReason ? `CLIENT'S REJECTION REASON:\n${evidence.clientRejectionReason}` : ''}

${evidence.otherEvidence ? `ADDITIONAL EVIDENCE:\n${evidence.otherEvidence}` : ''}

ARBITRATION FRAMEWORK:
- Was the work delivered according to specifications?
- Did the freelancer meet agreed deadlines?
- Were the client's rejection reasons justified?
- Did either party act in bad faith?

REQUIRED RESPONSE FORMAT (JSON):
{
  "ruling": "ClientWins" or "FreelancerWins",
  "confidence": float between 0.0 and 1.0 (how certain is this ruling),
  "reasoning": "Brief explanation of decision based on evidence",
  "factors_considered": ["list", "of", "key", "factors"]
}

DECISION MAKING GUIDELINES:
- Base decision strictly on provided evidence
- Consider quality, timeliness, and specification adherence
- Do not favor either party inherently
- State the reasoning clearly
- If evidence is inconclusive, favor the party that appears to have acted in good faith`;
  }

  /**
   * Validates that the AI response has the expected format
   */
  private isValidAIArbitrationResponse(response: any): response is AIArbitrationResponse {
    return (
      typeof response === 'object' &&
      response.ruling && 
      ['ClientWins', 'FreelancerWins'].includes(response.ruling) &&
      typeof response.confidence === 'number' &&
      response.confidence >= 0 && response.confidence <= 1 &&
      typeof response.reasoning === 'string' &&
      typeof response.project_id === 'number'
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