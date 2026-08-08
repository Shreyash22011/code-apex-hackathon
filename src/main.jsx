import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const hasClerk = Boolean(PUBLISHABLE_KEY)

if (!hasClerk) {
  console.warn("Missing VITE_CLERK_PUBLISHABLE_KEY — running without Clerk auth (local dev)")
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {hasClerk ? (
        <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
          <App />
        </ClerkProvider>
      ) : (
        <App />
      )}
    </BrowserRouter>
  </StrictMode>,
)
