import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { UserCircle } from "lucide-react";

export default function RegistrarProfile() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-md">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <UserCircle className="h-7 w-7 text-primary" />
          </div>
          <h2 className="font-heading text-xl font-bold text-foreground">{user.fullName}</h2>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{user.hospitalName}</p>
            <p className="capitalize">Registrar</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
