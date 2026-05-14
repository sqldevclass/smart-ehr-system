import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LabParametersSection } from "@/components/admin/LabParametersSection";

interface ServiceType {
  id: string;
  code: string | null;
  name_ru: string | null;
  name_en: string | null;
}
interface ServiceGroup {
  id: string;
  name: string;
  is_active: boolean;
}
interface ServiceSubgroup {
  id: string;
  name: string;
  is_active: boolean;
}
interface Service {
  id: string;
  name: string;
  code: string | null;
  cost: number;
  cost_with_vat: number | null;
  vat_rate: number | null;
  is_active: boolean;
  service_subgroup_id: string | null;
}

export default function ServicesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  // ----- Service Types -----
  const { data: types = [] } = useQuery({
    queryKey: ["service_types", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("service_types")
        .select("id, code, name_ru, name_en")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as ServiceType[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!selectedTypeId && types.length > 0) setSelectedTypeId(types[0].id);
  }, [types, selectedTypeId]);

  // ----- Groups -----
  const { data: groups = [] } = useQuery({
    queryKey: ["service_groups", user?.hospitalId, selectedTypeId],
    queryFn: async () => {
      if (!user || !selectedTypeId) return [];
      const { data, error } = await supabase
        .from("service_groups")
        .select("id, name, is_active")
        .eq("hospital_id", user.hospitalId)
        .eq("service_type_id", selectedTypeId)
        .order("name");
      if (error) throw error;
      return (data || []) as ServiceGroup[];
    },
    enabled: !!user && !!selectedTypeId,
  });

  useEffect(() => {
    setSelectedGroupId(null);
    setSelectedServiceId(null);
  }, [selectedTypeId]);

  useEffect(() => {
    setSelectedServiceId(null);
  }, [selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId && groups.length > 0) setSelectedGroupId(groups[0].id);
  }, [groups, selectedGroupId]);

  // ----- Subgroups -----
  const { data: subgroups = [] } = useQuery({
    queryKey: ["service_subgroups", user?.hospitalId, selectedGroupId],
    queryFn: async () => {
      if (!user || !selectedGroupId) return [];
      const { data, error } = await supabase
        .from("service_subgroups")
        .select("id, name, is_active")
        .eq("hospital_id", user.hospitalId)
        .eq("service_group_id", selectedGroupId)
        .order("name");
      if (error) throw error;
      return (data || []) as ServiceSubgroup[];
    },
    enabled: !!user && !!selectedGroupId,
  });

  // ----- Services -----
  const { data: services = [] } = useQuery({
    queryKey: ["services", user?.hospitalId, selectedGroupId],
    queryFn: async () => {
      if (!user || !selectedGroupId) return [];
      const { data, error } = await supabase
        .from("services")
        .select("id, name, code, cost, cost_with_vat, vat_rate, is_active, service_subgroup_id")
        .eq("hospital_id", user.hospitalId)
        .eq("service_group_id", selectedGroupId)
        .order("name");
      if (error) throw error;
      return (data || []) as Service[];
    },
    enabled: !!user && !!selectedGroupId,
  });

  // ============ Type Dialog ============
  const [typeDialog, setTypeDialog] = useState(false);
  const [editingType, setEditingType] = useState<ServiceType | null>(null);
  const [typeNameRu, setTypeNameRu] = useState("");
  const [typeNameEn, setTypeNameEn] = useState("");
  const [typeCode, setTypeCode] = useState("");

  const openCreateType = () => {
    setEditingType(null);
    setTypeNameRu(""); setTypeNameEn(""); setTypeCode("");
    setTypeDialog(true);
  };
  const openEditType = (t: ServiceType) => {
    setEditingType(t);
    setTypeNameRu(t.name_ru || "");
    setTypeNameEn(t.name_en || "");
    setTypeCode(t.code || "");
    setTypeDialog(true);
  };
  const saveType = async () => {
    if (!user) return;
    if (!typeNameRu.trim()) { toast.error("Name (RU) is required."); return; }
    try {
      if (editingType) {
        const { error } = await supabase.from("service_types").update({
          name_ru: typeNameRu.trim(),
          name_en: typeNameEn.trim() || null,
          code: typeCode.trim() || null,
        }).eq("id", editingType.id);
        if (error) throw error;
        toast.success("Type updated.");
      } else {
        const { error } = await supabase.from("service_types").insert({
          hospital_id: user.hospitalId,
          name_ru: typeNameRu.trim(),
          name_en: typeNameEn.trim() || null,
          code: typeCode.trim() || null,
        });
        if (error) throw error;
        toast.success("Type created.");
      }
      setTypeDialog(false);
      qc.invalidateQueries({ queryKey: ["service_types"] });
    } catch (e: any) { toast.error(e.message); }
  };

  // ============ Group Dialog ============
  const [groupDialog, setGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ServiceGroup | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupActive, setGroupActive] = useState(true);

  const openCreateGroup = () => {
    setEditingGroup(null); setGroupName(""); setGroupActive(true); setGroupDialog(true);
  };
  const openEditGroup = (g: ServiceGroup) => {
    setEditingGroup(g); setGroupName(g.name); setGroupActive(g.is_active); setGroupDialog(true);
  };
  const saveGroup = async () => {
    if (!user || !selectedTypeId) return;
    if (!groupName.trim()) { toast.error("Name is required."); return; }
    try {
      if (editingGroup) {
        const { error } = await supabase.from("service_groups").update({
          name: groupName.trim(), is_active: groupActive,
        }).eq("id", editingGroup.id);
        if (error) throw error;
        toast.success("Group updated.");
      } else {
        const { error } = await supabase.from("service_groups").insert({
          hospital_id: user.hospitalId,
          service_type_id: selectedTypeId,
          name: groupName.trim(),
        });
        if (error) throw error;
        toast.success("Group created.");
      }
      setGroupDialog(false);
      qc.invalidateQueries({ queryKey: ["service_groups"] });
    } catch (e: any) { toast.error(e.message); }
  };

  // ============ Subgroup Dialog ============
  const [subDialog, setSubDialog] = useState(false);
  const [editingSub, setEditingSub] = useState<ServiceSubgroup | null>(null);
  const [subName, setSubName] = useState("");
  const [subActive, setSubActive] = useState(true);

  const openCreateSub = () => {
    setEditingSub(null); setSubName(""); setSubActive(true); setSubDialog(true);
  };
  const openEditSub = (s: ServiceSubgroup) => {
    setEditingSub(s); setSubName(s.name); setSubActive(s.is_active); setSubDialog(true);
  };
  const saveSub = async () => {
    if (!user || !selectedGroupId) return;
    if (!subName.trim()) { toast.error("Name is required."); return; }
    try {
      if (editingSub) {
        const { error } = await supabase.from("service_subgroups").update({
          name: subName.trim(), is_active: subActive,
        }).eq("id", editingSub.id);
        if (error) throw error;
        toast.success("Subgroup updated.");
      } else {
        const { error } = await supabase.from("service_subgroups").insert({
          hospital_id: user.hospitalId,
          service_group_id: selectedGroupId,
          name: subName.trim(),
        });
        if (error) throw error;
        toast.success("Subgroup created.");
      }
      setSubDialog(false);
      qc.invalidateQueries({ queryKey: ["service_subgroups"] });
    } catch (e: any) { toast.error(e.message); }
  };

  // ============ Service Dialog ============
  const [svcDialog, setSvcDialog] = useState(false);
  const [editingSvc, setEditingSvc] = useState<Service | null>(null);
  const [svcName, setSvcName] = useState("");
  const [svcCode, setSvcCode] = useState("");
  const [svcSubgroupId, setSvcSubgroupId] = useState<string>("none");
  const [svcCost, setSvcCost] = useState<string>("0");
  const [svcVatRate, setSvcVatRate] = useState<string>("");
  const [svcActive, setSvcActive] = useState(true);

  const openCreateSvc = () => {
    setEditingSvc(null);
    setSvcName(""); setSvcCode(""); setSvcSubgroupId("none");
    setSvcCost("0"); setSvcVatRate(""); setSvcActive(true);
    setSvcDialog(true);
  };
  const openEditSvc = (s: Service) => {
    setEditingSvc(s);
    setSvcName(s.name);
    setSvcCode(s.code || "");
    setSvcSubgroupId(s.service_subgroup_id || "none");
    setSvcCost(String(s.cost ?? 0));
    setSvcVatRate(s.vat_rate != null ? String(s.vat_rate) : "");
    setSvcActive(s.is_active);
    setSvcDialog(true);
  };
  const saveSvc = async () => {
    if (!user || !selectedTypeId || !selectedGroupId) return;
    if (!svcName.trim()) { toast.error("Name is required."); return; }
    const costNum = Number(svcCost);
    if (isNaN(costNum) || costNum < 0) { toast.error("Cost must be ≥ 0."); return; }
    const vatNum = svcVatRate.trim() === "" ? null : Number(svcVatRate);
    if (vatNum !== null && isNaN(vatNum)) { toast.error("Invalid VAT rate."); return; }
    try {
      const payload: any = {
        name: svcName.trim(),
        code: svcCode.trim() || null,
        service_subgroup_id: svcSubgroupId === "none" ? null : svcSubgroupId,
        cost: costNum,
        vat_rate: vatNum,
        is_active: svcActive,
      };
      if (editingSvc) {
        const { error } = await supabase.from("services").update(payload).eq("id", editingSvc.id);
        if (error) throw error;
        toast.success("Service updated.");
      } else {
        const { error } = await supabase.from("services").insert({
          ...payload,
          hospital_id: user.hospitalId,
          service_type_id: selectedTypeId,
          service_group_id: selectedGroupId,
        });
        if (error) throw error;
        toast.success("Service created.");
      }
      setSvcDialog(false);
      qc.invalidateQueries({ queryKey: ["services"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const typeLabel = (t: ServiceType) => t.name_ru || t.name_en || t.code || "—";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Service Catalog</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Types */}
        <div className="lg:col-span-3 rounded-lg border bg-card flex flex-col">
          <div className="px-3 py-2 border-b">
            <h2 className="text-sm font-semibold">Service Types</h2>
          </div>
          <div className="flex-1 min-h-[200px] overflow-y-auto">
            {types.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No types yet.</p>
            ) : (
              <ul className="divide-y">
                {types.map((t) => (
                  <li
                    key={t.id}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent",
                      selectedTypeId === t.id && "bg-primary/10 text-primary font-medium"
                    )}
                    onClick={() => setSelectedTypeId(t.id)}
                  >
                    <span className="truncate">{typeLabel(t)}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditType(t); }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t p-2">
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={openCreateType}>
              <Plus className="h-4 w-4" /> Add Type
            </Button>
          </div>
        </div>

        {/* Middle: Groups + Subgroups */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="rounded-lg border bg-card flex flex-col">
            <div className="px-3 py-2 border-b">
              <h2 className="text-sm font-semibold">Groups</h2>
            </div>
            <div className="min-h-[180px] max-h-[300px] overflow-y-auto">
              {!selectedTypeId ? (
                <p className="p-3 text-sm text-muted-foreground">Select a type.</p>
              ) : groups.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No groups yet.</p>
              ) : (
                <ul className="divide-y">
                  {groups.map((g) => (
                    <li
                      key={g.id}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent",
                        selectedGroupId === g.id && "bg-primary/10 text-primary font-medium"
                      )}
                      onClick={() => setSelectedGroupId(g.id)}
                    >
                      <span className="truncate flex items-center gap-2">
                        {g.name}
                        {!g.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditGroup(g); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t p-2">
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={openCreateGroup} disabled={!selectedTypeId}>
                <Plus className="h-4 w-4" /> Add Group
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-card flex flex-col">
            <div className="px-3 py-2 border-b">
              <h2 className="text-sm font-semibold">Subgroups</h2>
            </div>
            <div className="min-h-[140px] max-h-[260px] overflow-y-auto">
              {!selectedGroupId ? (
                <p className="p-3 text-sm text-muted-foreground">Select a group.</p>
              ) : subgroups.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No subgroups.</p>
              ) : (
                <ul className="divide-y">
                  {subgroups.map((s) => (
                    <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-accent">
                      <span className="truncate flex items-center gap-2">
                        {s.name}
                        {!s.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSub(s)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t p-2">
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={openCreateSub} disabled={!selectedGroupId}>
                <Plus className="h-4 w-4" /> Add Subgroup
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Services */}
        <div className="lg:col-span-5 rounded-lg border bg-card flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <h2 className="text-sm font-semibold">Services</h2>
            <Button size="sm" className="gap-2" onClick={openCreateSvc} disabled={!selectedGroupId}>
              <Plus className="h-4 w-4" /> Add Service
            </Button>
          </div>
          <div className="overflow-x-auto">
            {!selectedGroupId ? (
              <p className="p-3 text-sm text-muted-foreground">Select a group.</p>
            ) : services.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No services yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Cost +VAT</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((s) => (
                    <TableRow
                      key={s.id}
                      className={cn("cursor-pointer", selectedServiceId === s.id && "bg-primary/10")}
                      onClick={() => setSelectedServiceId(s.id)}
                    >
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.code || "—"}</TableCell>
                      <TableCell className="text-right">{Number(s.cost).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{s.cost_with_vat != null ? Number(s.cost_with_vat).toFixed(2) : "—"}</TableCell>
                      <TableCell>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditSvc(s); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>

      {selectedServiceId && (() => {
        const t = types.find((x) => x.id === selectedTypeId);
        if (t?.code !== "laboratory") return null;
        return <LabParametersSection serviceId={selectedServiceId} />;
      })()}

      {/* Type Dialog */}
      <Dialog open={typeDialog} onOpenChange={setTypeDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingType ? "Edit Type" : "Add Type"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name (RU) *</Label><Input value={typeNameRu} onChange={(e) => setTypeNameRu(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Name (EN)</Label><Input value={typeNameEn} onChange={(e) => setTypeNameEn(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={typeCode} onChange={(e) => setTypeCode(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialog(false)}>Cancel</Button>
            <Button onClick={saveType}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Dialog */}
      <Dialog open={groupDialog} onOpenChange={setGroupDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingGroup ? "Edit Group" : "Add Group"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={groupName} onChange={(e) => setGroupName(e.target.value)} /></div>
            {editingGroup && (
              <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={groupActive} onCheckedChange={setGroupActive} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialog(false)}>Cancel</Button>
            <Button onClick={saveGroup}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subgroup Dialog */}
      <Dialog open={subDialog} onOpenChange={setSubDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSub ? "Edit Subgroup" : "Add Subgroup"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={subName} onChange={(e) => setSubName(e.target.value)} /></div>
            {editingSub && (
              <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={subActive} onCheckedChange={setSubActive} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubDialog(false)}>Cancel</Button>
            <Button onClick={saveSub}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service Dialog */}
      <Dialog open={svcDialog} onOpenChange={setSvcDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSvc ? "Edit Service" : "Add Service"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={svcName} onChange={(e) => setSvcName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={svcCode} onChange={(e) => setSvcCode(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Subgroup</Label>
              <Select value={svcSubgroupId} onValueChange={setSvcSubgroupId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {subgroups.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cost *</Label>
                <Input type="number" min="0" step="0.01" value={svcCost} onChange={(e) => setSvcCost(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>VAT Rate (%)</Label>
                <Input type="number" min="0" step="0.01" value={svcVatRate} onChange={(e) => setSvcVatRate(e.target.value)} placeholder="Hospital default" />
              </div>
            </div>
            <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={svcActive} onCheckedChange={setSvcActive} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSvcDialog(false)}>Cancel</Button>
            <Button onClick={saveSvc}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
