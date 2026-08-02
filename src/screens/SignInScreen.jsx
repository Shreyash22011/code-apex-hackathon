import { SignIn } from "@clerk/clerk-react"
import { dark } from "@clerk/themes"

export default function SignInScreen() {
  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center relative overflow-hidden p-6">
      {/* Background Decor */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl opacity-60" />
        <div className="absolute -bottom-28 -right-24 w-96 h-96 rounded-full bg-accent/10 blur-3xl opacity-60" />
      </div>

      <div className="relative z-10 mb-8 text-center animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-border">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
          </div>
          <h1 className="text-3xl font-bold glow-text">SchemaSense <span className="text-sm font-mono font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full align-middle">3D</span></h1>
        </div>
        <p className="text-muted-foreground text-lg">Sign in to access your workspaces</p>
      </div>

      <div className="relative z-10 animate-slide-up">
        <SignIn 
          path="/sign-in" 
          routing="path" 
          signUpUrl="/sign-up"
          forceRedirectUrl="/upload"
          appearance={{
            baseTheme: dark,
            variables: { 
              colorPrimary: '#20c9a6',
              colorBackground: '#0b0c10',
              colorInputBackground: '#16181d',
              colorInputText: '#f1f5f9',
            },
            elements: {
              card: 'bg-card/40 backdrop-blur-2xl border border-border/70 shadow-2xl rounded-2xl',
              headerTitle: 'hidden',
              headerSubtitle: 'hidden',
              formButtonPrimary: 'glow-border',
              footerActionText: 'text-muted-foreground',
            }
          }}
        />
      </div>
    </div>
  )
}
