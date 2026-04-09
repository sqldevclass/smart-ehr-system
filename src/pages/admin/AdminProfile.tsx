import { useAuth } from "@/hooks/useAuth";

export default function AdminProfile() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">My Profile</h1>
      <div className="rounded-lg border bg-card p-6 space-y-3 text-sm">
        <div><span className="font-medium text-muted-foreground">Name:</span> {user.fullName}</div>
        <div><span className="font-medium text-muted-foreground">Role:</span> {user.role}</div>
        <div><span className="font-medium text-muted-foreground">Hospital:</span> {user.hospitalName}</div>
      </div>
    </div>
  );
}
