import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

const roleRoutes: Record<string, string> = {
  admin: "/admin",
  physician: "/physician",
  registrar: "/registrar",
  pharmacy_staff: "/pharmacy",
  warehouse_staff: "/warehouse",
};

export default function AcceptInvite() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; general?: string }>({});

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-6 space-y-4">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <p className="text-muted-foreground">
              Invalid invitation link. Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const validate = () => {
    const e: typeof errors = {};
    if (password.length < 8) e.password = "Password must be at least 8 characters.";
    if (password !== confirm) e.confirm = "Passwords do not match.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setErrors({});

    try {
      const supabaseUrl = (supabase as any).supabaseUrl ?? "https://efgyjxanyqrlifjzznae.supabase.co";
      const supabaseKey = (supabase as any).supabaseKey ?? "sb_publishable_NAV4xE-ROrGKl_-FF1Dw2w_BZ4Vdjyz";

      const response = await fetch(`${supabaseUrl}/functions/v1/create-staff-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
        },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setErrors({ general: data.error || "Failed to create account." });
        return;
      }

      // Auto sign-in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      });

      if (signInError) {
        toast.error("Account created but sign-in failed. Please log in manually.");
        navigate("/login", { replace: true });
        return;
      }

      toast.success("Account created successfully!");
      navigate(roleRoutes[data.role] || "/login", { replace: true });
    } catch {
      setErrors({ general: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Accept Your Invitation</CardTitle>
          <CardDescription>Set up your account to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.general && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errors.general}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="inv-pw">Password</Label>
              <Input
                id="inv-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-confirm">Confirm Password</Label>
              <Input
                id="inv-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {errors.confirm && <p className="text-sm text-destructive">{errors.confirm}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating Account…" : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
