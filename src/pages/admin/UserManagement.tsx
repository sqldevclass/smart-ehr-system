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
import { format } from "date-fns";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  created_at: string;
  email?: string;
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
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Profile | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role, created_at, hospital_id")
      .eq("hospital_id", user.hospitalId)
      .order("created_at", { ascending: false });

    setProfiles((data as Profile[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = profiles.filter((p) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
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
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-10">No users found.</TableCell></TableRow>
              ) : filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={roleBadge[p.role] || ""}>
                      {p.role?.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.created_at ? format(new Date(p.created_at), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setRoleTarget(p)}>Change Role</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <InviteStaffSheet open={inviteOpen} onOpenChange={setInviteOpen} onSuccess={fetchUsers} />
      {roleTarget && (
        <ChangeRoleDialog
          open={!!roleTarget}
          onOpenChange={(o) => { if (!o) setRoleTarget(null); }}
          profileId={roleTarget.id}
          currentRole={roleTarget.role}
          fullName={roleTarget.full_name}
          onSuccess={() => { setRoleTarget(null); fetchUsers(); }}
        />
      )}
    </div>
  );
}
