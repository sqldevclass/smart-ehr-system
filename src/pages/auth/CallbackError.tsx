export default function CallbackError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <h1 className="text-xl font-semibold text-destructive">Link Error</h1>
        <p className="text-muted-foreground">
          Invalid or expired invite link. Please contact your administrator.
        </p>
        <a href="/login" className="text-primary underline text-sm">
          Go to login
        </a>
      </div>
    </div>
  );
}
