import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const exchange = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (!code) {
        setError("Invalid or expired invite link. Please contact your administrator.");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setError("Invalid or expired invite link. Please contact your administrator.");
        return;
      }

      navigate("/auth/set-password", { replace: true });
    };

    exchange();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-xl font-semibold text-destructive">Link Error</h1>
          <p className="text-muted-foreground">{error}</p>
          <a href="/login" className="text-primary underline text-sm">Go to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Verifying invite link…</p>
    </div>
  );
}
