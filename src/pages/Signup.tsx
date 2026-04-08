import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Shield, Mail, Phone, MapPin, User, Lock } from "lucide-react";
import { Link } from "react-router-dom";

interface FormData {
  hospitalName: string;
  hospitalAddress: string;
  hospitalPhone: string;
  hospitalEmail: string;
  adminFullName: string;
  adminEmail: string;
  adminPassword: string;
  confirmPassword: string;
}

const initialFormData: FormData = {
  hospitalName: "",
  hospitalAddress: "",
  hospitalPhone: "",
  hospitalEmail: "",
  adminFullName: "",
  adminEmail: "",
  adminPassword: "",
  confirmPassword: "",
};

const Signup = () => {
  const [form, setForm] = useState<FormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const validate = (): string | null => {
    if (!form.hospitalName.trim()) return "Hospital name is required.";
    if (!form.hospitalEmail.trim()) return "Hospital email is required.";
    if (!form.adminFullName.trim()) return "Admin full name is required.";
    if (!form.adminEmail.trim()) return "Admin email is required.";
    if (!form.adminPassword) return "Password is required.";
    if (form.adminPassword.length < 8) return "Password must be at least 8 characters.";
    if (form.adminPassword !== form.confirmPassword) return "Passwords do not match.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'register-hospital',
        {
          body: {
            hospital_name: form.hospitalName.trim(),
            hospital_address: form.hospitalAddress.trim() || null,
            hospital_phone: form.hospitalPhone.trim() || null,
            hospital_email: form.hospitalEmail.trim(),
            admin_full_name: form.adminFullName.trim(),
            admin_email: form.adminEmail.trim(),
            admin_password: form.adminPassword,
          },
        }
      );

      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Something went wrong. Please try again.");
        return;
      }

      if (data?.success) {
        setSuccess(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-elevated">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <Mail className="h-7 w-7 text-accent" />
            </div>
            <h2 className="font-heading text-xl font-bold text-foreground">Check your email</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Account created. Please check your email to confirm your account before signing in.
            </p>
            <Link to="/login">
              <Button variant="outline" className="mt-2">Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Register your hospital
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Get started with a free trial — set up your medical center in minutes.
          </p>
        </div>

        <Card className="shadow-elevated">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Building2 className="h-4 w-4 text-primary" />
              Hospital Information
            </CardTitle>
            <CardDescription>Details about your medical facility</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Hospital fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="hospitalName">Hospital Name *</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="hospitalName"
                      name="hospitalName"
                      value={form.hospitalName}
                      onChange={handleChange}
                      placeholder="General City Hospital"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hospitalAddress">Address</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="hospitalAddress"
                      name="hospitalAddress"
                      value={form.hospitalAddress}
                      onChange={handleChange}
                      placeholder="123 Medical Drive"
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hospitalPhone">Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="hospitalPhone"
                        name="hospitalPhone"
                        value={form.hospitalPhone}
                        onChange={handleChange}
                        placeholder="+1 (555) 000-0000"
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hospitalEmail">Hospital Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="hospitalEmail"
                        name="hospitalEmail"
                        type="email"
                        value={form.hospitalEmail}
                        onChange={handleChange}
                        placeholder="info@hospital.com"
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 text-muted-foreground flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    Admin Account
                  </span>
                </div>
              </div>

              {/* Admin fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="adminFullName">Full Name *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="adminFullName"
                      name="adminFullName"
                      value={form.adminFullName}
                      onChange={handleChange}
                      placeholder="Dr. Jane Smith"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Admin Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="adminEmail"
                      name="adminEmail"
                      type="email"
                      value={form.adminEmail}
                      onChange={handleChange}
                      placeholder="admin@hospital.com"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="adminPassword">Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="adminPassword"
                        name="adminPassword"
                        type="password"
                        value={form.adminPassword}
                        onChange={handleChange}
                        placeholder="Min. 8 characters"
                        className="pl-10"
                        required
                        minLength={8}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        value={form.confirmPassword}
                        onChange={handleChange}
                        placeholder="Repeat password"
                        className="pl-10"
                        required
                        minLength={8}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account…" : "Create Hospital Account"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already registered?{" "}
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
