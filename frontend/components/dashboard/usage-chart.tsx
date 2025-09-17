'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface UsageChartProps {
  data: Array<{
    date: string
    cached: number
    total: number
    saved: number
  }>
}

export function UsageChart({ data }: UsageChartProps) {
  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Cache Performance</CardTitle>
        <CardDescription>Daily cache hits vs total requests</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="total" 
              stroke="#8884d8" 
              name="Total Requests"
              strokeWidth={2}
            />
            <Line 
              type="monotone" 
              dataKey="cached" 
              stroke="#82ca9d" 
              name="Cache Hits"
              strokeWidth={2}
            />
            <Line 
              type="monotone" 
              dataKey="saved" 
              stroke="#ffc658" 
              name="Cost Saved ($)"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}