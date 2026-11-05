import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClinicStructureTree } from "@/components/admin/clinic-structure/ClinicStructureTree";
import DepartmentsPage from "./DepartmentsPage";
import RoomsPage from "./RoomsPage";
import WarehousesPage from "./WarehousesPage";

export default function ClinicStructurePage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = requested && ["structure", "departments", "rooms", "warehouses"].includes(requested) ? requested : "structure";
  return <div className="min-w-0 space-y-4">
    <h1 className="text-2xl font-semibold text-foreground">Структура клиники</h1>
    <Tabs value={tab} onValueChange={value => setParams({ tab: value })}>
      <TabsList className="h-auto flex-wrap"><TabsTrigger value="structure">Структура</TabsTrigger><TabsTrigger value="departments">Отделения</TabsTrigger><TabsTrigger value="rooms">Палаты</TabsTrigger><TabsTrigger value="warehouses">Склады</TabsTrigger></TabsList>
      <TabsContent value="structure"><ClinicStructureTree /></TabsContent>
      <TabsContent value="departments"><DepartmentsPage /></TabsContent>
      <TabsContent value="rooms"><RoomsPage /></TabsContent>
      <TabsContent value="warehouses"><WarehousesPage /></TabsContent>
    </Tabs>
  </div>;
}