// frontend/app/api/ai-arbitrator/route.ts
import { NextRequest } from 'next/server'
import { aiArbitrationService } from '../../services/ai-arbitration-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.projectId || !body.clientClaim || !body.freelancerClaim) {
      return Response.json(
        { error: 'projectId, clientClaim, and freelancerClaim are required' },
        { status: 400 }
      )
    }

    // Use the AI arbitration service to process the request
    const result = await aiArbitrationService.evaluateDispute(body);

    return Response.json(result);
  } catch (error: any) {
    console.error('AI Arbitration Error:', error);

    // Return a more user-friendly error message
    if (error.message.includes('OpenAI API key')) {
      return Response.json(
        { error: 'AI arbitration service is not properly configured' },
        { status: 500 }
      );
    }

    return Response.json(
      {
        error: 'Failed to process arbitration request',
        details: error.message
      },
      { status: 500 }
    );
  }
}