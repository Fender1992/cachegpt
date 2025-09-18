import { NextRequest, NextResponse } from 'next/server'

// Simple email notification for support requests
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, subject, category, message } = body

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // In production, you would send this to your email service
    // For now, we'll just log it and return success
    console.log('Support request received:', {
      name,
      email,
      subject,
      category,
      message,
      timestamp: new Date().toISOString()
    })

    // Here you would typically:
    // 1. Send email to support team
    // 2. Create ticket in support system
    // 3. Send confirmation email to user

    return NextResponse.json({
      success: true,
      message: 'Support request received. We will respond within 24 hours.'
    })

  } catch (error) {
    console.error('Support API error:', error)
    return NextResponse.json(
      { error: 'Failed to process support request' },
      { status: 500 }
    )
  }
}