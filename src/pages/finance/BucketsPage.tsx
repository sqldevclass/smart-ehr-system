import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

interface BucketRow {
  id: string;
  name: string;
  percent: number;
  is_active: boolean;
}

interface ItemRow {
  id: string;
  label: string;
  kind: "Service" | "Group";
}

interface MemberRow {
  id: string;
  staff_role_id: string;
  percent: number;
  full_name: string;
}

export default function BucketsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [bucketDialogOpen, setBucketDialogOpen] = useState(false);
  const [bucketEditingId, setBucketEditingId] = useState<string | null>(null);
  const [bucketName, setBucketName] = useState("");
  const [bucketPercent, setBucketPercent] = useState("");

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemKind, setItemKind] = useState<"service" | "group">("service");
  const [itemValue, setItemValue] = useState("");

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberStaffRoleId, setMemberStaffRoleId] = useState("");
  const [memberPercent, setMemberPercent] = useState("");

  const { data: buckets = [], isLoading } = useQuery({
    queryKey: ["payroll-buckets", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("payroll_buckets")
        .select("id, name, percent, is_active")
        .eq("hospital_id", user.hospitalId)
        .order("name");
      if (error) throw error;
      return (data || []) as BucketRow[];
    },
    enabled: !!user,
  });

  const { data: physicians = [] } = useQuery({
    queryKey: ["finance-physicians", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("staff_roles")
        .select("id, persons!inner(first_name, last_name)")
        .eq("hospital_id", user.hospitalId)
        .eq("role_type", "physician")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        full_name: `${p.persons?.last_name ?? ""} ${p.persons?.first_name ?? ""}`.trim() || "Unknown",
      }));
    },
    enabled: !!user,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services_all", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: serviceGroups = [] } = useQuery({
    queryKey: ["service_groups_all", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("service_groups")
        .select("id, name")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["bucket-items", selectedBucketId],
    queryFn: async () => {
      if (!selectedBucketId) return [];
      const { data, error } = await supabase
        .from("payroll_bucket_items")
        .select("id, service_id, service_group_id, services(name), service_groups(name)")
        .eq("bucket_id", selectedBucketId);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        label: r.services?.name ?? r.service_groups?.name ?? "Unknown",
        kind: r.service_id ? "Service" : "Group",
      })) as ItemRow[];
    },
    enabled: !!selectedBucketId,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["bucket-members", selectedBucketId],
    queryFn: async () => {
      if (!selectedBucketId) return [];
      const { data, error } = await supabase
        .from("payroll_bucket_members")
        .select("id, staff_role_id, percent, staff_roles(persons(first_name, last_name))")
        .eq("bucket_id", selectedBucketId);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        staff_role_id: r.staff_role_id,
        percent: r.percent,
        full_name: `${r.staff_roles?.persons?.last_name ?? ""} ${r.staff_roles?.persons?.first_name ?? ""}`.trim() || "Unknown",
      })) as MemberRow[];
    },
    enabled: !!selectedBucketId,
  });

  const selectedBucket = buckets.find((b) => b.id === selectedBucketId);
  const membersTotal = members.reduce((sum, m) => sum + Number(m.percent), 0);

  const invalidateBuckets = () => queryClient.invalidateQueries({ queryKey: ["payroll-buckets", user?.hospitalId] });
  const invalidateBucketDetail = () => {
    queryClient.invalidateQueries({ queryKey: ["bucket-items", selectedBucketId] });
    queryClient.invalidateQueries({ queryKey: ["bucket-members", selectedBucketId] });
  };

  const openCreateBucket = () => {
    setBucketEditingId(null);
    setBucketName("");
    setBucketPercent("");
    setBucketDialogOpen(true);
  };

  const openEditBucket = (b: BucketRow) => {
    setBucketEditingId(b.id);
    setBucketName(b.name);
    setBucketPercent(String(b.percent));
    setBucketDialogOpen(true);
  };

  const handleSaveBucket = async () => {
    if (!user || !bucketName.trim() || bucketPercent === "") {
      toast.error("Enter a name and percent.");
      return;
    }
    const numPercent = Number(bucketPercent);
    if (isNaN(numPercent) || numPercent < 0 || numPercent > 100) {
      toast.error("Percent must be between 0 and 100.");
      return;
    }
    setSaving(true);
    try {
      if (bucketEditingId) {
        const { error } = await supabase.rpc("update_payroll_bucket", {
          p_bucket_id: bucketEditingId,
          p_name: bucketName.trim(),
          p_percent: numPercent,
        });
        if (error) throw error;
        toast.success("Bucket updated.");
      } else {
        const { error } = await supabase.rpc("create_payroll_bucket", {
          p_hospital_id: user.hospitalId,
          p_name: bucketName.trim(),
          p_percent: numPercent,
        });
        if (error) throw error;
        toast.success("Bucket created.");
      }
      setBucketDialogOpen(false);
      invalidateBuckets();
    } catch (err: any) {
      toast.error(err.message || "Failed to save bucket.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (b: BucketRow) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_payroll_bucket_active", {
        p_bucket_id: b.id,
        p_is_active: !b.is_active,
      });
      if (error) throw error;
      invalidateBuckets();
    } catch (err: any) {
      toast.error(err.message || "Failed to update bucket.");
    } finally {
      setSaving(false);
    }
  };

  const openAddItem = () => {
    setItemKind("service");
    setItemValue("");
    setItemDialogOpen(true);
  };

  const handleAddItem = async () => {
    if (!selectedBucketId || !itemValue) {
      toast.error("Select a service or service group.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("add_bucket_item", {
        p_bucket_id: selectedBucketId,
        p_service_id: itemKind === "service" ? itemValue : null,
        p_service_group_id: itemKind === "group" ? itemValue : null,
      });
      if (error) throw error;
      toast.success("Added to bucket.");
      setItemDialogOpen(false);
      invalidateBucketDetail();
    } catch (err: any) {
      toast.error(err.message || "Failed to add. It may already be in this bucket.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("remove_bucket_item", { p_item_id: itemId });
      if (error) throw error;
      invalidateBucketDetail();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove.");
    } finally {
      setSaving(false);
    }
  };

  const openAddMember = () => {
    setMemberStaffRoleId("");
    setMemberPercent("");
    setMemberDialogOpen(true);
  };

  const openEditMember = (m: MemberRow) => {
    setMemberStaffRoleId(m.staff_role_id);
    setMemberPercent(String(m.percent));
    setMemberDialogOpen(true);
  };

  const handleSaveMember = async () => {
    if (!selectedBucketId || !memberStaffRoleId || memberPercent === "") {
      toast.error("Select a physician and enter a percent.");
      return;
    }
    const numPercent = Number(memberPercent);
    if (isNaN(numPercent) || numPercent < 0 || numPercent > 100) {
      toast.error("Percent must be between 0 and 100.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_bucket_member", {
        p_bucket_id: selectedBucketId,
        p_staff_role_id: memberStaffRoleId,
        p_percent: numPercent,
      });
      if (error) throw error;
      toast.success("Member saved.");
      setMemberDialogOpen(false);
      invalidateBucketDetail();
    } catch (err: any) {
      toast.error(err.message || "Failed to save member. Check their percent doesn't exceed what's left in the bucket.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (staffRoleId: string) => {
    if (!selectedBucketId) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("remove_bucket_member", {
        p_bucket_id: selectedBucketId,
        p_staff_role_id: staffRoleId,
      });
      if (error) throw error;
      invalidateBucketDetail();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Buckets</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">All Buckets</h3>
            <Button size="sm" onClick={openCreateBucket} className="gap-1">
              <Plus className="h-4 w-4" /> New Bucket
            </Button>
          </div>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>%</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buckets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">No buckets yet.</TableCell>
                  </TableRow>
                ) : buckets.map((b) => (
                  <TableRow
                    key={b.id}
                    className={selectedBucketId === b.id ? "bg-muted cursor-pointer" : "cursor-pointer"}
                    onClick={() => setSelectedBucketId(b.id)}
                  >
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>{b.percent}%</TableCell>
                    <TableCell>
                      {b.is_active ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!selectedBucketId || !selectedBucket ? (
            <p className="text-muted-foreground">Select a bucket, or create a new one.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-xl font-semibold text-foreground">{selectedBucket.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Target: {selectedBucket.percent}% · Allocated to members: {membersTotal}%
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={selectedBucket.is_active} onCheckedChange={() => handleToggleActive(selectedBucket)} />
                    <span className="text-sm text-muted-foreground">Active</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openEditBucket(selectedBucket)} className="gap-1">
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-foreground">Services &amp; Service Groups</h3>
                  <Button size="sm" onClick={openAddItem} className="gap-1">
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsLoading ? (
                      <TableRow><TableCell colSpan={3} className="text-muted-foreground">Loading…</TableCell></TableRow>
                    ) : items.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-muted-foreground">No services or groups added.</TableCell></TableRow>
                    ) : items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell>{it.label}</TableCell>
                        <TableCell>{it.kind}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => handleRemoveItem(it.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-foreground">Members</h3>
                  <Button size="sm" onClick={openAddMember} className="gap-1">
                    <Plus className="h-4 w-4" /> Add / Edit
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Physician</TableHead>
                      <TableHead>%</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersLoading ? (
                      <TableRow><TableCell colSpan={3} className="text-muted-foreground">Loading…</TableCell></TableRow>
                    ) : members.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-muted-foreground">No members added.</TableCell></TableRow>
                    ) : members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.full_name}</TableCell>
                        <TableCell>{m.percent}%</TableCell>
                        <TableCell className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEditMember(m)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleRemoveMember(m.staff_role_id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={bucketDialogOpen} onOpenChange={setBucketDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bucketEditingId ? "Edit Bucket" : "New Bucket"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bucketName">Name</Label>
              <Input id="bucketName" value={bucketName} onChange={(e) => setBucketName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bucketPercent">Bucket % (target)</Label>
              <Input id="bucketPercent" type="number" min={0} max={100} value={bucketPercent} onChange={(e) => setBucketPercent(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBucketDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBucket} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Service or Service Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={itemKind} onValueChange={(v) => { setItemKind(v as "service" | "group"); setItemValue(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Specific Service</SelectItem>
                  <SelectItem value="group">Service Group</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{itemKind === "service" ? "Service" : "Service Group"}</Label>
              <Select value={itemValue} onValueChange={setItemValue}>
                <SelectTrigger>
                  <SelectValue placeholder={itemKind === "service" ? "Select service" : "Select group"} />
                </SelectTrigger>
                <SelectContent>
                  {(itemKind === "service" ? services : serviceGroups).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add / Edit Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Physician</Label>
              <Select value={memberStaffRoleId} onValueChange={setMemberStaffRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select physician" />
                </SelectTrigger>
                <SelectContent>
                  {physicians.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="memberPercent">Member % (of bucket revenue)</Label>
              <Input id="memberPercent" type="number" min={0} max={100} value={memberPercent} onChange={(e) => setMemberPercent(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMember} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
