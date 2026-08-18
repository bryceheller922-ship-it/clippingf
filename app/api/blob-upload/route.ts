import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

// Issues short-lived tokens so the browser can upload the video straight to
// Vercel Blob, bypassing the 4.5MB serverless request body limit.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        maximumSizeInBytes: 4 * 1024 * 1024 * 1024, // TikTok's 4GB cap
        addRandomSuffix: true
      }),
      // Not used — the browser drives publishing once the upload completes.
      onUploadCompleted: async () => {}
    });
    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
