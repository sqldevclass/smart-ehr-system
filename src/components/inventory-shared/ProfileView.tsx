import { useAuth } from "@/hooks/useAuth";

export default function ProfileView() {
  const { user } = useAuth();
  if (!user) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="max-w-md space-y-4">
      <h2 className="font-heading text-xl font-bold text-foreground">My Profile</h2>
      <div className="rounded-lg border bg-card p-6 space-y-3 text-sm">
        <div>
          <p className="text-muted-foreground">Full Name</p>
          <p className="font-medium text-foreground">{user.fullName}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Roles</p>
          <p className="font-medium text-foreground">{user.roles.join(", ")}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Hospital</p>
          <p className="font-medium text-foreground">{user.hospitalName}</p>
        </div>
      </div>
    </div>
  );
}
