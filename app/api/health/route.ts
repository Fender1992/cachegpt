import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'API is working'
    },
    { status: 200 }
  );
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