import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function PricingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Pricing</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Free Plan</CardTitle>
            <CardDescription>Basic access to Compound activity data</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside">
              <li>Up to 100 transactions per query</li>
              <li>Limited to 10 queries per day</li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button>Current Plan</Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Premium Plan</CardTitle>
            <CardDescription>Advanced access to Compound activity data</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside">
              <li>Unlimited transactions per query</li>
              <li>Unlimited queries per day</li>
              <li>Access to historical data</li>
              <li>Advanced analytics</li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button>Upgrade to Premium</Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
