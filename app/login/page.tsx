import { Suspense } from "react"
import AuthDialog from "@/components/auth/AuthDialog"

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthDialog />
    </Suspense>
  )
}
