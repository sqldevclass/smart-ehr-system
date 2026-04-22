import { useAuth } from "@/hooks/useAuth";

const roleTitles: Record<string, string> = {
  admin: "Administrator",
  physician: "Physician",
  registrar: "Registrar",
  pharmacy_staff: "Pharmacy Staff",
  warehouse_staff: "Warehouse Staff",
};

export default function PhysicianProfile() {
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
          <p className="text-muted-foreground">Role</p>
          <p className="font-medium text-foreground">{user.roles.map((r) => roleTitles[r] || r).join(", ")}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Hospital</p>
          <p className="font-medium text-foreground">{user.hospitalName}</p>
        </div>
      </div>
    </div>
  );
}
