import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'API is working'
    },
    {
      status: 200,
      headers: {
        'Date': new Date().toUTCString()
      }
    }
  );
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Date': new Date().toUTCString()
    }
  });
}

export async function POST() {
  return NextResponse.json(
    {
      status: 'ok',
      method: 'POST',
      timestamp: new Date().toISOString()
    },
    { status: 200 }
  );
}