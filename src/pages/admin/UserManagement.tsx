import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Search } from "lucide-react";
import InviteStaffSheet from "@/components/admin/InviteStaffSheet";
import ChangeRoleDialog from "@/components/admin/ChangeRoleDialog";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { format } from "date-fns";
import { toast } from "sonner";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  created_at: string;
}

interface Invitation {
  id: string;
  full_name: string;
  email: string;
  role: string;
  invited_at: string;
  auth_user_id: string;
}

const roleBadge: Record<string, string> = {
  admin: "bg-primary/10 text-primary",
  physician: "bg-chart-2/20 text-chart-2",
  registrar: "bg-chart-3/20 text-chart-3",
  pharmacy_staff: "bg-chart-4/20 text-chart-4",
  warehouse_staff: "bg-chart-5/20 text-chart-5",
};

export default function UserManagement() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Profile | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Profile | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);
  const [removing, setRemoving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const fetchStaff = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [profilesRes, invitationsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role, created_at")
        .eq("hospital_id", user.hospitalId)
        .neq("id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("staff_invitations")
        .select("id, full_name, email, role, invited_at, auth_user_id")
        .eq("hospital_id", user.hospitalId)
        .eq("status", "pending")
        .order("invited_at", { ascending: false }),
    ]);

    setProfiles((profilesRes.data as Profile[]) || []);
    setInvitations((invitationsRes.data as Invitation[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const filteredProfiles = profiles.filter((p) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const { data, error } = await supabase.functions.invoke("remove-staff-user", {
        body: { target_user_id: removeTarget.id },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Failed to remove user.");
        return;
      }
      toast.success("User removed");
      setRemoveTarget(null);
      fetchStaff();
    } finally {
      setRemoving(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const { data, error } = await supabase.functions.invoke("remove-staff-user", {
        body: { target_user_id: revokeTarget.auth_user_id },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Failed to revoke invitation.");
        return;
      }
      toast.success("Invitation revoked");
      setRevokeTarget(null);
      fetchStaff();
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" /> Invite Staff Member
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <p className="text-muted-foreground py-10 text-center">Loading…</p>
      ) : (
        <>
          {/* Active Staff */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-foreground">Active Staff</h2>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Member Since</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-10">No active staff found.</TableCell></TableRow>
                  ) : filteredProfiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={roleBadge[p.role] || ""}>
                          {p.role?.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.created_at ? format(new Date(p.created_at), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => setRoleTarget(p)}>Change Role</Button>
                        <Button size="sm" variant="destructive" onClick={() => setRemoveTarget(p)}>Remove</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Pending Invitations */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-foreground">Pending Invitations</h2>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Invited At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No pending invitations.</TableCell></TableRow>
                  ) : invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{inv.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={roleBadge[inv.role] || ""}>
                          {inv.role?.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.invited_at ? format(new Date(inv.invited_at), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="destructive" onClick={() => setRevokeTarget(inv)}>Revoke</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}

      <InviteStaffSheet open={inviteOpen} onOpenChange={setInviteOpen} onSuccess={fetchStaff} />

      {roleTarget && (
        <ChangeRoleDialog
          open={!!roleTarget}
          onOpenChange={(o) => { if (!o) setRoleTarget(null); }}
          profileId={roleTarget.id}
          currentRole={roleTarget.role}
          fullName={roleTarget.full_name}
          onSuccess={() => { setRoleTarget(null); fetchStaff(); }}
        />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}
        title="Remove Staff Member"
        description={`Are you sure you want to remove ${removeTarget?.full_name}? This cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={handleRemove}
        loading={removing}
        destructive
      />

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => { if (!o) setRevokeTarget(null); }}
        title="Revoke Invitation"
        description={`Revoke invitation for ${revokeTarget?.email}?`}
        confirmLabel="Revoke"
        onConfirm={handleRevoke}
        loading={revoking}
        destructive
      />
    </div>
  );
}
